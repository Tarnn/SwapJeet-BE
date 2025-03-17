import { DynamoDB } from 'aws-sdk';
import dotenv from 'dotenv';

dotenv.config();

const dynamoDB = new DynamoDB({
  region: 'local',
  endpoint: 'http://localhost:8000',
  accessKeyId: 'local',
  secretAccessKey: 'local'
});

const tables = [
  {
    TableName: 'users',
    KeySchema: [
      { AttributeName: 'userId', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'EmailIndex',
        KeySchema: [
          { AttributeName: 'email', KeyType: 'HASH' }
        ],
        Projection: {
          ProjectionType: 'ALL'
        },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  },
  {
    TableName: 'user_activities',
    KeySchema: [
      { AttributeName: 'userId', KeyType: 'HASH' },
      { AttributeName: 'timestamp', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'timestamp', AttributeType: 'S' }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  },
  {
    TableName: 'wallets',
    KeySchema: [
      { AttributeName: 'userId', KeyType: 'HASH' },
      { AttributeName: 'address', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'address', AttributeType: 'S' }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  }
];

async function createTables() {
  for (const tableParams of tables) {
    try {
      console.log(`Creating table: ${tableParams.TableName}`);
      await dynamoDB.createTable(tableParams).promise();
      console.log(`Table ${tableParams.TableName} created successfully`);
    } catch (error: any) {
      if (error.code === 'ResourceInUseException') {
        console.log(`Table ${tableParams.TableName} already exists`);
      } else {
        console.error(`Error creating table ${tableParams.TableName}:`, error);
      }
    }
  }
}

createTables()
  .then(() => console.log('Database setup complete'))
  .catch(error => console.error('Database setup failed:', error)); 