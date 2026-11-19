import crypto from 'node:crypto';
import { ApiError } from '../utils/api-error.js';

function remoteUserId(payload) {
  return payload?.user?.id ?? payload?.userId ?? payload?.user_id ?? payload?.id;
}

function responseMessage(payload, fallback) {
  return payload?.message ?? payload?.error ?? payload?.detail ?? fallback;
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

export async function provisionTeamLoggerEmployee(employee, config) {
  if (!config.teamLoggerEnabled || !config.teamLoggerApiKey) {
    throw new ApiError(503, 'TEAMLOGGER_NOT_CONFIGURED', 'TeamLogger integration is not enabled on the server');
  }
  if (employee.teamLoggerStatus === 'provisioned') return employee;
  if (employee.teamLoggerStatus === 'provisioned') return employee;

  employee.teamLoggerStatus = 'pending';
  employee.teamLoggerLastAttemptAt = new Date();
  await employee.save();

  const temporaryPassword = crypto.randomBytes(32).toString('base64url');
  let response;
  let payload;
  try {
    response = await fetch(`${config.teamLoggerApiBaseUrl}/api/integration/create_user`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.teamLoggerApiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
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
    employee.teamLoggerStatus = 'failed';
    await employee.save();
    throw new ApiError(502, 'TEAMLOGGER_UNAVAILABLE', 'TeamLogger could not be reached', {
      reason: error.name === 'TimeoutError' ? 'timeout' : 'network_error',
    });
  }

  const duplicate = response.status === 409
    || /already\s+(exists|registered)|duplicate/i.test(String(responseMessage(payload, '')));
  if ((!response.ok || payload?.success === false) && !duplicate) {
    employee.teamLoggerStatus = 'failed';
    await employee.save();
    throw new ApiError(502, 'TEAMLOGGER_PROVISIONING_FAILED', 'TeamLogger rejected employee provisioning', {
      statusCode: response.status,
      providerMessage: responseMessage(payload, 'Unknown TeamLogger response'),
    });
  }

  employee.teamLoggerStatus = 'provisioned';
  employee.teamLoggerUserId = remoteUserId(payload) ? String(remoteUserId(payload)) : employee.teamLoggerUserId;
  employee.teamLoggerProvisionedAt = new Date();
  await employee.save();
  return employee;
}
