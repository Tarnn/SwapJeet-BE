export const ZAPPER_TRANSACTIONS_QUERY = `
  query TransactionsQuery(
    $address: Address!,
    $before: String,
    $after: String,
    $first: Int = 100
  ) {
    transactions(
      address: $address,
      before: $before,
      after: $after,
      first: $first
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        hash
        type
        timestamp
        symbol
        amount
        amountUSD
        token {
          address
          symbol
          decimals
          price
        }
        to {
          address
        }
        from {
          address
        }
      }
    }
  }
`;

export const ZAPPER_PORTFOLIO_QUERY = `
  query Portfolio($addresses: [Address!]!, $first: Int!) {
    portfolioV2(addresses: $addresses) {
      tokenBalances {
        totalBalanceUSD
        byToken(first: $first) {
          totalCount
          edges {
            node {
              name
              symbol
              price
              tokenAddress
              imgUrlV2
              decimals
              balanceRaw
              balance
              balanceUSD
              network {
                name
              }
            }
          }
        }
      }
    }
  }
`; 