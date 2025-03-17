import axios from 'axios';
import { logger } from '../../config/logger';
import { ZAPPER_PORTFOLIO_QUERY, ZAPPER_TRANSACTIONS_QUERY } from './queries';
import { ZapperPortfolioV2Response, ZapperTransactionsResponse } from './types';

export class ZapperClient {
  private readonly baseUrl = 'https://public.zapper.xyz/graphql';
  private readonly encodedKey: string;

  constructor() {
    this.encodedKey = Buffer.from(process.env.ZAPPER_API_KEY || '').toString('base64');
  }

  private async query<T>(query: string, variables: Record<string, any>): Promise<T> {
    const response = await axios({
      url: this.baseUrl,
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${this.encodedKey}`
      },
      data: {
        query,
        variables
      }
    });

    return response.data as T;
  }

  async getPortfolio(addresses: string[], first: number = 100): Promise<ZapperPortfolioV2Response> {
    try {
      const response = await this.query<ZapperPortfolioV2Response>(
        ZAPPER_PORTFOLIO_QUERY,
        { addresses, first }
      );

      if (response.errors) {
        logger.error('GraphQL Errors from Zapper Portfolio Query', { errors: response.errors });
        throw new Error(`GraphQL Errors: ${JSON.stringify(response.errors)}`);
      }

      return response;
    } catch (error) {
      logger.error('Failed to fetch portfolio from Zapper', {
        error: error instanceof Error ? error.message : 'Unknown error',
        addresses,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  async getTransactions(
    address: string,
    options: {
      first?: number;
      before?: string;
      after?: string;
    } = {}
  ): Promise<ZapperTransactionsResponse> {
    try {
      const response = await this.query<ZapperTransactionsResponse>(
        ZAPPER_TRANSACTIONS_QUERY,
        {
          address,
          first: options.first || 100,
          before: options.before,
          after: options.after
        }
      );

      if (response.errors) {
        logger.error('GraphQL Errors from Zapper Transactions Query', { errors: response.errors });
        throw new Error(`GraphQL Errors: ${JSON.stringify(response.errors)}`);
      }

      return response;
    } catch (error) {
      logger.error('Failed to fetch transactions from Zapper', {
        error: error instanceof Error ? error.message : 'Unknown error',
        address,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }
} 