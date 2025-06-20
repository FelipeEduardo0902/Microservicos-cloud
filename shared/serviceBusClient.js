// shared/serviceBusClient.js
const { ServiceBusClient } = require("@azure/service-bus");

const connectionString = process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;

function getServiceBusClient() {
  return new ServiceBusClient(connectionString);
}

module.exports = getServiceBusClient;

