import { DynamoDBClient, CreateTableCommand, ListTablesCommand, ScalarAttributeType, KeyType, ProjectionType } from '@aws-sdk/client-dynamodb';
import 'dotenv/config';

const client = new DynamoDBClient({
  region: 'local',
  endpoint: 'http://127.0.0.1:8000',
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local'
  }
});

const tables = [
  {
    TableName: process.env.USERS_TABLE || 'users',
    KeySchema: [
      { AttributeName: 'userId', KeyType: KeyType.HASH }
    ],
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'email', AttributeType: ScalarAttributeType.S }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'email-index',
        KeySchema: [
          { AttributeName: 'email', KeyType: KeyType.HASH }
        ],
        Projection: {
          ProjectionType: ProjectionType.ALL
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
    TableName: process.env.USER_ACTIVITY_TABLE || 'user_activities',
    KeySchema: [
      { AttributeName: 'userId', KeyType: KeyType.HASH },
      { AttributeName: 'timestamp', KeyType: KeyType.RANGE }
    ],
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'timestamp', AttributeType: ScalarAttributeType.S }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  },
  {
    TableName: process.env.WALLETS_TABLE || 'wallets',
    KeySchema: [
      { AttributeName: 'userId', KeyType: KeyType.HASH },
      { AttributeName: 'address', KeyType: KeyType.RANGE }
    ],
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'address', AttributeType: ScalarAttributeType.S }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  }
];

async function createTables() {
  try {
    // List existing tables
    const { TableNames } = await client.send(new ListTablesCommand({}));
    console.log('Existing tables:', TableNames);

    // Create tables
    for (const tableConfig of tables) {
      try {
        if (TableNames?.includes(tableConfig.TableName)) {
          console.log(`Table ${tableConfig.TableName} already exists`);
          continue;
        }

        await client.send(new CreateTableCommand(tableConfig));
        console.log(`Created table ${tableConfig.TableName}`);
      } catch (error) {
        if (error instanceof Error && error.name === 'ResourceInUseException') {
          console.log(`Table ${tableConfig.TableName} already exists`);
        } else {
          console.error(`Error creating table ${tableConfig.TableName}:`, error);
        }
      }
    }

    console.log('All tables created successfully');
  } catch (error) {
    console.error('Error setting up tables:', error);
    process.exit(1);
  }
}

createTables(); 