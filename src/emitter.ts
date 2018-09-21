import * as fs from 'fs'
import stringify from 'json-stable-stringify'
import * as path from 'path'

import { Config } from './config'
import * as parser from './parser'

const PARAM_INDENT = '  '
const RES_INDENT = '    '
const BODY_INDENT = '        '
const JSON_INDENT_LEN = 2

/**
 * Replace koa and express style url params (i.e. /myroute/:param) with the type
 * api blueprint expects (/myroute/{param})
 */
function formatPath(path: string): string {
    return path.replace(/:([^/]+)/g, '{$1}')
}

/**
 * An emitter for creating API blueprint files.
 *
 * It takes in a filename to write to as well as some optional metadata, and
 * exports an emit method that writes route documentation to the file.
 */
export class DocumentationEmitter {
    private fileStream: fs.WriteStream

    constructor(public config: Config) {
        const { host, title, description, output } = config
        this.fileStream = fs.createWriteStream(output, { autoClose: true })
        this.emitMetadata(host, title, description)
    }

    /**
     * Write the header and API title + description to the file.
     */
    private emitMetadata(host?: string, title?: string, description?: string) {
        this.fileStream.write('FORMAT: 1A\n')
        if (host) this.fileStream.write(`HOST: ${host}\n`)
        this.fileStream.write('\n')
        if (title) this.fileStream.write(`# ${title}\n\n`)
        if (description) this.fileStream.write(description)
        this.fileStream.write('\n')
    }

    /**
     * Write a set of routes to the file.
     */
    public emit(doc: parser.Documentation.Router) {
        this.fileStream.write(`\n# Group ${doc.title}\n` + (doc.description || '') + '\n')
        doc.routes.forEach(g => this.emitGroup(g, doc.path))
    }

    /**
     * Write a single route path, with multiple methods, to the file.
     *
     * NOTE: this does not actually group them
     */
    private emitGroup(doc: parser.Documentation.Group, leadingPath: string): void {
        doc.methods.forEach(r => this.emitRoute(r, leadingPath))
    }

    /**
     * Write a single route HTTP method documentation to the file.
     */
    private emitRoute(doc: parser.Documentation.Block, leadingPath: string): void {
        // Emit a group for each path.
        // We may want to group them in the future, but this allows the script to do its job
        let url = path.join(leadingPath, formatPath(doc.path))
        const queryParams = doc.params.filter(p => p.query).map(p => p.name)
        if (queryParams.length > 0) {
            url += '{?' + queryParams.join(',') + '}'
        }
        this.fileStream.write(`\n## <Unnamed group> [${url}]\n`)

        // Output the route description
        this.fileStream.write(`\n### ${doc.title} [${doc.method.toUpperCase()}]\n`)
        this.fileStream.write(doc.description + '\n')

        if (doc.params.length > 0) {
            this.fileStream.write('\n+ Parameters\n')
            doc.params.forEach(p => this.emitParam(p))
        }

        if (doc.body) this.emitBody(doc.body)
        doc.responses.forEach(r => this.emitResponse(r))
    }

    /**
     * Emit a parameter for the route, either found in the url path or the query parameters.
     */
    private emitParam(param: parser.Documentation.Param): void {
        this.fileStream.write(PARAM_INDENT + `+ ${param.name}: ${(param.query ? encodeURIComponent : encodeURI)(param.example)} (required, ${param.type}) - ${param.description}\n`)
    }

    /**
     * Wrie a route response to the file.
     */
    private emitResponse(res: parser.Documentation.Response): void {
        // Ignore res.when
        // if (res.when) {
        //     this.fileStream.write(`\n+ Request ${res.when}\n`)
        // }
        this.fileStream.write(`\n+ Response ${res.code}`)
        // Aglio hightlights the syntax of responses marked with text/plain, but
        // not ones which don't have syntax highlighting, so we ignore
        // text/plain types.
        if (res.type && res.type !== 'text/plain') this.fileStream.write(` (${res.type})`)
        this.fileStream.write('\n')
        if (res.body) {
            this.fileStream.write('\n' + RES_INDENT + '+ Body\n')
            const body = (typeof res.body === 'string') ? res.body : stringify(res.body, { space: JSON_INDENT_LEN })
            const indentedBody = body.split('\n').map(l => RES_INDENT + BODY_INDENT + l).join('\n')
            this.fileStream.write('\n' + indentedBody + '\n')
        }
        if (res.schema) {
            this.fileStream.write('\n' + RES_INDENT + '+ Schema\n')
            const schemaText = stringify(res.schema, { space: JSON_INDENT_LEN })
            const indentedSchema = schemaText.split('\n').map(l => RES_INDENT + BODY_INDENT + l).join('\n')
            this.fileStream.write('\n' + indentedSchema + '\n')
        }
    }

    private emitBody(body: parser.Documentation.RequestBody): void {
        //+ Request Create Blog Post (application/json)
        //       { "message" : "Hello World." }
        this.fileStream.write(`\n+ Request <name> (${body.type})`)

        const bodyText = (typeof body.body === 'string') ? body.body : stringify(body.body, { space: JSON_INDENT_LEN })
        const indentedBody = bodyText.split('\n').map(l => RES_INDENT + BODY_INDENT + l).join('\n')
        // const schemaText = stringify(body.schema, { space: JSON_INDENT_LEN })
        // const indentedSchema = schemaText.split('\n').map(l => RES_INDENT + BODY_INDENT + l).join('\n')

        this.fileStream.write(`\n${indentedBody}\n`)
    }

    public async close(): Promise<void> {
        this.fileStream.end()
        await new Promise((resolve, reject) => {
            this.fileStream.on('close', resolve)
        })
    }
}
