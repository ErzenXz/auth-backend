'use strict';
require('dotenv').config();

/**
 * New Relic agent configuration.
 *
 * See the complete list of configuration options at:
 * https://docs.newrelic.com/docs/agents/nodejs-agent/installation-configuration/nodejs-agent-configuration
 */
exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: {
    level: process.env.NEW_RELIC_LOG_LEVEL,
  },
  distributed_tracing: {
    enabled: true,
  },
};
