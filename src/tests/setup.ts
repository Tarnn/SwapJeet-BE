import { jest } from '@jest/globals';

// Mock canvas module
jest.mock('canvas', () => ({
  createCanvas: jest.fn().mockReturnValue({
    getContext: jest.fn().mockReturnValue({
      fillStyle: '',
      fillRect: jest.fn(),
      font: '',
      fillText: jest.fn(),
      toBuffer: jest.fn().mockReturnValue(Buffer.from('mock-image'))
    })
  }),
  loadImage: jest.fn().mockResolvedValue({
    width: 100,
    height: 100
  })
}));

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  }))
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  PutObjectCommand: jest.fn()
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-presigned-url.com')
}));

// Mock axios
jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn()
}));

// Mock cache
jest.mock('../config/cache', () => ({
  walletDetailsCache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn()
  },
  walletUpdatesCache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn()
  },
  leaderboardCache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn()
  }
})); 