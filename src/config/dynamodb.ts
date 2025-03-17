import { DynamoDB } from 'aws-sdk';

const dynamoDB = new DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || 'local',
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
  accessKeyId: 'local',
  secretAccessKey: 'local'
});

export default dynamoDB; 