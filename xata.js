"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getXataClient = exports.XataClient = void 0;
// Updated manually to match your schema in Xata
const { buildClient } = require("@xata.io/client");

/** @typedef { import('./types').SchemaTables } SchemaTables */
const tables = [
  {
    name: "sell_listings",
    columns: [
      { name: "id", type: "string", primary: true },
      { name: "seller_name", type: "string" },
      { name: "email", type: "string" },
      { name: "contact_number", type: "string" },
      { name: "whatsapp_number", type: "string" },
      { name: "item_name", type: "string" },
      { name: "item_description", type: "text" },
      { name: "price", type: "float" },
      { name: "price_period", type: "string" },
      { name: "images", type: "string" }, // semicolon-separated URLs
      { name: "is_published", type: "bool" }
    ]
  },
  {
    name: "lease_listings",
    columns: [
      { name: "id", type: "string", primary: true },
      { name: "seller_name", type: "string" },
      { name: "email", type: "string" },
      { name: "contact_number", type: "string" },
      { name: "whatsapp_number", type: "string" },
      { name: "item_name", type: "string" },
      { name: "item_description", type: "text" },
      { name: "price", type: "float" },
      { name: "price_period", type: "string" },
      { name: "images", type: "string" }, // semicolon-separated URLs
      { name: "is_published", type: "bool" }
    ]
  }
];

/** @type { import('@xata.io/client').ClientConstructor<{}> } */
const DatabaseClient = buildClient();

/** @typedef { import('./types').DatabaseSchema } DatabaseSchema */
/** @extends DatabaseClient<DatabaseSchema> */
class XataClient extends DatabaseClient {
  constructor(options) {
    super(
      {
        databaseURL: process.env.XATA_DATABASE_URL || "https://UniToolsMarketplace-s-workspace-35jkgh.eu-central-1.xata.sh/db/unitools-db",
        apiKey: process.env.XATA_API_KEY, // make sure you have this in .env
        ...options
      },
      tables
    );
  }
}

exports.XataClient = XataClient;

let instance = undefined;
/** @type { () => XataClient } */
const getXataClient = () => {
  if (instance) return instance;
  instance = new XataClient();
  return instance;
};

exports.getXataClient = getXataClient;
