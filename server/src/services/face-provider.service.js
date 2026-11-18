import {
  CompareFacesCommand,
  DetectFacesCommand,
  RekognitionClient,
} from '@aws-sdk/client-rekognition';
import { ApiError } from '../utils/api-error.js';

let cachedClient;
let cachedClientKey;

function getClient(config) {
  const key = `${config.awsRegion}:${config.awsAccessKeyId}`;
  if (!cachedClient || cachedClientKey !== key) {
    cachedClient = new RekognitionClient({
      region: config.awsRegion,
      credentials: {
        accessKeyId: config.awsAccessKeyId,
        secretAccessKey: config.awsSecretAccessKey,
      },
    });
    cachedClientKey = key;
  }
  return cachedClient;
}

function normalizeProviderError(error) {
  if (error instanceof ApiError) return error;
  if (error?.name === 'InvalidParameterException') {
    return new ApiError(422, 'FACE_NOT_DETECTED', 'A single clear face could not be detected');
  }
  if (['UnrecognizedClientException', 'InvalidSignatureException', 'ExpiredTokenException'].includes(error?.name)) {
    console.error({ code: error?.name, message: error?.message, provider: 'aws-rekognition' });
    return new ApiError(
      503,
      'FACE_PROVIDER_CREDENTIALS_INVALID',
      'AWS face verification credentials are invalid or expired. Ask HR to update the Render AWS credentials',
    );
  }
  if (error?.name === 'AccessDeniedException') {
    console.error({ code: error?.name, message: error?.message, provider: 'aws-rekognition' });
    return new ApiError(
      503,
      'FACE_PROVIDER_ACCESS_DENIED',
      'AWS Rekognition permission is missing. Ask HR to allow DetectFaces and CompareFaces',
    );
  }
  if (error?.name === 'ThrottlingException') {
    return new ApiError(503, 'FACE_PROVIDER_BUSY', 'Face verification is busy. Wait a moment and try again');
  }
  console.error({ code: error?.name, message: error?.message, provider: 'aws-rekognition' });
  return new ApiError(503, 'FACE_PROVIDER_UNAVAILABLE', 'AWS face verification is temporarily unavailable. Check the Render service logs');
}

export async function validateFaceImage(imageBytes, config) {
  try {
    const response = await getClient(config).send(new DetectFacesCommand({
      Image: { Bytes: imageBytes },
      Attributes: ['DEFAULT'],
    }));
    const faces = response.FaceDetails || [];
    if (faces.length !== 1) {
      throw new ApiError(422, 'FACE_COUNT_INVALID', faces.length
        ? 'Only one face may be visible during verification'
        : 'No clear face was detected');
    }
    const face = faces[0];
    if ((face.Confidence || 0) < 98) {
      throw new ApiError(422, 'FACE_QUALITY_LOW', 'Face confidence is too low; improve lighting and try again');
    }
    return {
      confidence: Number((face.Confidence || 0).toFixed(2)),
      brightness: Number((face.Quality?.Brightness || 0).toFixed(2)),
      sharpness: Number((face.Quality?.Sharpness || 0).toFixed(2)),
    };
  } catch (error) {
    throw normalizeProviderError(error);
  }
}

export async function compareFaceImages(referenceBytes, liveBytes, config) {
  await validateFaceImage(liveBytes, config);
  try {
    const response = await getClient(config).send(new CompareFacesCommand({
      SourceImage: { Bytes: referenceBytes },
      TargetImage: { Bytes: liveBytes },
      SimilarityThreshold: 0,
      QualityFilter: 'MEDIUM',
    }));
    const similarity = Math.max(0, ...(response.FaceMatches || []).map((match) => match.Similarity || 0));
    return {
      matched: similarity >= config.faceSimilarityThreshold,
      similarity: Number(similarity.toFixed(2)),
      threshold: config.faceSimilarityThreshold,
      provider: 'aws-rekognition',
    };
  } catch (error) {
    throw normalizeProviderError(error);
  }
}

export function resetFaceProviderClientForTests() {
  cachedClient?.destroy?.();
  cachedClient = undefined;
  cachedClientKey = undefined;
}
