import * as tjs from 'typescript-json-schema'

import { Config } from './config'

/**
 * Creates an example Body from a schema
 *
 * @param {tjs.Definition} schema the schema to parse
 * @returns an example body as JSON
 */
export function createSchemaExample(schema: tjs.Definition, config: Config, name?: string): any {
    let type = schema.type
    if (Array.isArray(schema.type) && schema.type.length) type = schema.type[0]
    const examples = config.examples.response

    switch (type) {
      case 'object':
        const res = Object.keys(schema.properties || {}).reduce((obj, prop) => {
          obj[prop] = createSchemaExample(schema.properties![prop], config, prop)
          return obj
        }, {} as any);
        if (schema.additionalProperties && schema.additionalProperties !== true) {
          res[config.defaults.jsonKey] = createSchemaExample(schema.additionalProperties, config);
        }
        return res;
      case 'array':
        if (name && examples.hasOwnProperty(name)) return examples[name]
        if (!Array.isArray(schema.items)) return [createSchemaExample(schema.items as tjs.Definition,config)]
        return schema.items!.map(item => createSchemaExample(item, config))
      case 'number':
        if (name && examples.hasOwnProperty(name)) return examples[name]
        return config.defaults.number
      case 'string':
        if (name && examples.hasOwnProperty(name)) return examples[name]
        return config.defaults.string
      case 'boolean':
        if (name && examples.hasOwnProperty(name)) return examples[name]
        return config.defaults.boolean
      default:
        throw new Error(`Unexpected type ${type} in schema ${JSON.stringify(schema)}`)
    }
  }
