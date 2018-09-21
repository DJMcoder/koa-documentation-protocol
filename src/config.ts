import { readFileSync } from 'fs'

import { NiceError } from './errors'

export interface ConfigDefaults {
    number: number;
    string: string;
    boolean: boolean;
    jsonKey: string;
}

export interface Config {
    output: string
    host?: string
    title?: string
    description?: string
    defaults: ConfigDefaults
    examples: {
        response: { [example: string]: string|number|boolean },
        param: { [example: string]: string }
    }
    afterHook?: string
}

const defaultDefaults: ConfigDefaults = {
    number: 0,
    string: "abcd",
    boolean: true,
    jsonKey: "key"
}

/**
 * Parses a config file, ensuring the output is of the correct type and has all
 * required properties.
 */
export function validateConfig(config: any): Config {
    const output = config.output
    if (typeof output !== 'string') throw new Error('Property output is not defined')

    const host = (typeof config.host === 'string') ? config.host : undefined
    const title = (typeof config.title === 'string') ? config.title : undefined
    const description = (typeof config.description === 'string') ? config.description : undefined
    const afterHook = (typeof config.afterHook === 'string') ? config.afterHook : undefined

    const defaults = (typeof config.defaults === 'object' && config.defaults ? config.defaults : {})
    for (const key of Object.keys(defaultDefaults) as Array<keyof ConfigDefaults>)
        defaults[key] = typeof defaults[key] === key ? defaults[key] : defaultDefaults[key];

    const examples = (typeof config.examples === 'object' && config.examples ? config.examples : {})
    examples.response = (typeof examples.response === 'object' && examples.response ? examples.response : {})
    examples.param = (typeof examples.param === 'object' && examples.param ? examples.param : {})
    if (typeof examples.all === 'object' && examples.all) {
        for (const index in examples.all)
            examples.response[index] = examples.param[index] = examples.all[index]
    }

    return { output, host, title, description, defaults, examples, afterHook }
}

/**
 * Locates and parses a config file at the given path, giving detailed error
 * messages meant to be displayed to the user if there is a problem.
 */
export function parseConfig(file: string): Config {
    let rawConfig, json
    try {
        rawConfig = readFileSync(file).toString()
    } catch (e) {
        throw new NiceError(`Error: Config file ${file} was not found.\n  ${e.message}`
        + '\nA docconfig.json file needs to be created with parameters such as where the api'
        + '\ndocumentation should be created. If you\'ve named the file something else, use'
        + '\nthe --project option.')
    }
    try {
        json = JSON.parse(rawConfig)
    } catch (e) {
        throw new NiceError(`Error: Could not parse config file ${file} as JSON.\n  ${e.message}`)
    }
    try {
        return validateConfig(json)
    } catch (e) {
        throw new NiceError(`Error: Config file ${file} is invalid.\n  ${e.message}\nSee README.md for docconfig.json format.`)
    }
}
