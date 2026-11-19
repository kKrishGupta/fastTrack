import crypto from 'node:crypto';
import { ApiError } from '../utils/api-error.js';

const provisioningInFlight = new Map();

function getTeamLoggerUserId(payload) {
  const candidates = [
    payload,
    payload?.user,
    payload?.item,
    payload?.data,
    payload?.data?.user,
    payload?.result,
    payload?.result?.user,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const id = candidate.guid ?? candidate.id ?? candidate.userId ?? candidate.user_id;
    if (id !== undefined && id !== null && String(id).trim()) return String(id);
  }
  return null;
}

function responseMessage(payload, fallback) {
  return payload?.message ?? payload?.error ?? payload?.detail ?? fallback;
}

function provisioningError(response, payload) {
  const providerMessage = String(responseMessage(payload, 'Unknown TeamLogger response')).trim();
  const normalizedMessage = providerMessage.toUpperCase();

  if (normalizedMessage === 'EMAIL_DOMAIN_IS_NOT_WHITELISTED') {
    return new ApiError(
      422,
      'EMAIL_DOMAIN_IS_NOT_WHITELISTED',
      "TeamLogger does not allow this employee's email domain. Add the domain to the TeamLogger whitelist or use an approved work email.",
      { statusCode: response.status, providerMessage, retryable: false },
    );
  }
  if (response.status === 401 || response.status === 403) {
    return new ApiError(
      502,
      'TEAMLOGGER_AUTHENTICATION_FAILED',
      'TeamLogger authentication failed. Verify the server API key and integration access.',
      { statusCode: response.status, providerMessage, retryable: false },
    );
  }

  return new ApiError(
    502,
    'TEAMLOGGER_PROVISIONING_FAILED',
    'TeamLogger rejected employee provisioning',
    { statusCode: response.status, providerMessage, retryable: true },
  );
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 300) };
  }
}

function requestHeaders(config, hasBody = false) {
  return {
    Authorization: `Bearer ${config.teamLoggerApiKey}`,
    Accept: 'application/json',
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
  };
}

function normalizedEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeUserList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.users)) return payload.users;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.users)) return payload.data.users;
  return null;
}

async function listTeamLoggerUsers(config) {
  let response;
  let payload;
  try {
    response = await fetch(`${config.teamLoggerApiBaseUrl}/api/integration/list_users`, {
      headers: requestHeaders(config),
      signal: AbortSignal.timeout(config.teamLoggerRequestTimeoutMs),
    });
    payload = await parseResponse(response);
  } catch (error) {
    throw new ApiError(502, 'TEAMLOGGER_UNAVAILABLE', 'TeamLogger could not be reached', {
      reason: error.name === 'TimeoutError' ? 'timeout' : 'network_error',
      operation: 'list_users',
      retryable: true,
    });
  }

  if (!response.ok) throw provisioningError(response, payload);
  const users = normalizeUserList(payload);
  if (!users) {
    throw new ApiError(502, 'TEAMLOGGER_INVALID_RESPONSE', 'TeamLogger returned an invalid user list', {
      operation: 'list_users',
      retryable: true,
    });
  }
  return users;
}

function findUserByEmail(users, email) {
  const targetEmail = normalizedEmail(email);
  return users.find((user) => normalizedEmail(user?.email) === targetEmail);
}

async function saveProvisionedEmployee(employee, remoteUser) {
  const userId = getTeamLoggerUserId(remoteUser);
  if (!userId) {
    throw new ApiError(502, 'TEAMLOGGER_GUID_MISSING', 'TeamLogger user was found without a recognizable GUID', {
      retryable: true,
    });
  }
  employee.teamLoggerStatus = 'provisioned';
  employee.teamLoggerUserId = userId;
  employee.teamLoggerProvisionedAt = new Date();
  await employee.save();
  return employee;
}

async function markProvisioningFailed(employee) {
  employee.teamLoggerStatus = 'failed';
  await employee.save();
}

async function reconcileRemoteEmployee(employee, config) {
  const users = await listTeamLoggerUsers(config);
  const existing = findUserByEmail(users, employee.email);
  return existing ? saveProvisionedEmployee(employee, existing) : null;
}

function isDuplicateResponse(response, payload) {
  const message = String(responseMessage(payload, ''));
  return response.status === 409
    || /already\s+(exists|registered)|duplicate|active account.*same email|email.*already/i.test(message);
}

async function provision(employee, config) {
  if (!config.teamLoggerEnabled || !config.teamLoggerApiKey) {
    throw new ApiError(503, 'TEAMLOGGER_NOT_CONFIGURED', 'TeamLogger integration is not enabled on the server');
  }
  if (employee.teamLoggerStatus === 'provisioned' && employee.teamLoggerUserId) return employee;

  employee.teamLoggerStatus = 'pending';
  employee.teamLoggerLastAttemptAt = new Date();
  await employee.save();

  try {
    const linked = await reconcileRemoteEmployee(employee, config);
    if (linked) return linked;
  } catch (error) {
    await markProvisioningFailed(employee);
    throw error;
  }

  const temporaryPassword = crypto.randomBytes(32).toString('base64url');
  let response;
  let payload;
  try {
    response = await fetch(`${config.teamLoggerApiBaseUrl}/api/integration/create_user`, {
      method: 'POST',
      headers: requestHeaders(config, true),
      body: JSON.stringify({
        email: employee.email,
        username: employee.email,
        password: temporaryPassword,
        name: employee.name,
        employeeCode: employee.employeeCode,
      }),
      signal: AbortSignal.timeout(config.teamLoggerRequestTimeoutMs),
    });
    payload = await parseResponse(response);
  } catch (error) {
    // TeamLogger may have committed the user before the connection failed.
    try {
      const linked = await reconcileRemoteEmployee(employee, config);
      if (linked) return linked;
    } catch {
      // Preserve the original create_user network error below.
    }
    await markProvisioningFailed(employee);
    throw new ApiError(502, 'TEAMLOGGER_UNAVAILABLE', 'TeamLogger could not be reached', {
      reason: error.name === 'TimeoutError' ? 'timeout' : 'network_error',
      operation: 'create_user',
      retryable: true,
    });
  }

  if ((!response.ok || payload?.success === false) && isDuplicateResponse(response, payload)) {
    try {
      const linked = await reconcileRemoteEmployee(employee, config);
      if (linked) return linked;
    } catch (error) {
      await markProvisioningFailed(employee);
      throw error;
    }
  }

  if (!response.ok || payload?.success === false) {
    await markProvisioningFailed(employee);
    throw provisioningError(response, payload);
  }

  if (getTeamLoggerUserId(payload)) return saveProvisionedEmployee(employee, payload);

  try {
    const linked = await reconcileRemoteEmployee(employee, config);
    if (linked) return linked;
  } catch (error) {
    await markProvisioningFailed(employee);
    throw error;
  }

  await markProvisioningFailed(employee);
  throw new ApiError(502, 'TEAMLOGGER_GUID_MISSING', 'TeamLogger created the user but did not return a recognizable GUID', {
    retryable: true,
  });
}

export async function provisionTeamLoggerEmployee(employee, config) {
  const key = String(employee.id ?? employee._id ?? normalizedEmail(employee.email));
  const current = provisioningInFlight.get(key);
  if (current) return current;

  const operation = provision(employee, config);
  provisioningInFlight.set(key, operation);
  try {
    return await operation;
  } finally {
    if (provisioningInFlight.get(key) === operation) provisioningInFlight.delete(key);
  }
}
