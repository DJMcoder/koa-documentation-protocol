import parse from 'comment-parser'
import ts from 'typescript'
import * as tjs from 'typescript-json-schema'

import { Config } from './config'
import { DocumentationEmitter } from './emitter'
import { NiceError } from './errors'
import { createSchemaExample } from './examples'
import * as logger from './logger'

const ROUTER_TYPE = 'Router'
const ROUTER_METHODS = ['get', 'post', 'put', 'patch', 'delete']

export namespace Documentation {

  /**
   * A top-level description of a set of route paths, along with the paths
   */
  export interface Router {
    /**
     * The base path of the router, excluding the domain (e.g. /user)
     */
    path: string
    /**
     * Title of the router, to use in documentation (e.g. User)
     */
    title: string
    /**
     * Description of the router for use in documentation
     */
    description: string | undefined
    routes: Documentation.Group[]
  }

  /**
   * Groups together different methods (GET, POST, etc.) of a single route path.
   */
  export interface Group {
    path: string
    methods: Documentation.Block[]
  }

  /**
   * Holds the content of a parsed route form the code.
   */
  export interface Block {
    /**
     * The HTTP method of the documentation block
     */
    method: string
    /**
     * The path that the documentation block describes (not including the
     * domain), relative to the base path of the router
     */
    path: string
    /**
     * The title of the documentation block
     */
    title: string
    /**
     * Description of what how the route functions
     */
    description: string
    /**
     * The parameters which the route takes in
     */
    params: Documentation.Param[]
    /**
     * The possible ways that the server will respond to the request
     */
    responses: Documentation.Response[]
    /**
     * The POST body of an incoming request
     */
    body: Documentation.RequestBody | null
  }

  /**
   * Structure used for both parameters in the url (/url/:param) and query
   * parameters (url?param=)
   */
  export interface Param {
    /**
     * True if the param is a query parameter or false if it is a URL parameter
     */
    query: boolean
    /**
     * The name of the parameter as used in the code and as sent
     */
    name: string
    /**
     * The type that the parameter will be interpreted as (e.g. string)
     */
    type: string
    /**
     * The description of the parameter and how it is used for documentation purposes
     */
    description: string
    /**
     * An example value of the paramter
     */
    example: string
  }

  /**
   * Structure representing a possible response for a given request
   */
  export interface Response {
    /**
     * The status code of the response
     */
    code: number
    /**
     * The condition which will trigger this response
     */
    when: string | null
    /**
     * The content type of the response (e.g. text/plain)
     */
    type: string | null
    /**
     * An example response that the server might send
     */
    body: any | null
    /**
     * The schema of how the server will respond
     */
    schema: tjs.Definition | null
  }

  /**
   * Structure used to represent the @body tag, which accounts for the POST body
   */
  export interface RequestBody {
    /**
     * The content type of the request (e.g. application/json)
     */
    type: string | null
    /**
     * An example of what might be sent to the server
     */
    body: any | null
    /**
     * The schema of what is supposed to be sent to the server
     */
    schema: tjs.Definition | null
  }

}

/**
 * A representation of the current position in the scanned file
 */
interface Position {
  /**
   * The line number in the file
   */
  line: number,
  /**
   * The file with the line
   */
  sourceFile: ts.SourceFile
}

/**
 * Emits documentation for a given set of source files
 *
 * @param files the files to document
 * @param program configuration of the top-level typescript project
 * @param emitter used to write out documentation
 */
export function createDocumentation(files: ReadonlyArray<ts.SourceFile>, program: ts.Program, emitter: DocumentationEmitter): void {
  // Only emit routes for files not in the node_modules folder
  const nonLibFiles = files.filter(f => !f.fileName.includes('node_modules'))
  // The generator is used to create JSON schemas from typescript types
  const generator = tjs.buildGenerator(program, {
    ignoreErrors: true
  } /*, nonLibFiles.map(f => f.fileName) */)
  if (generator === null) throw new Error('program has errors')
  nonLibFiles.forEach(f => documentSourceFile(f, program, generator, emitter))
}

/**
 * Determine if a function is of the form Router.(get|post|...)
 */
function isRouterFunction(sourceFile: ts.SourceFile, node: ts.CallExpression, checker: ts.TypeChecker): boolean {
  const expr = node.expression
  // This expression has 3 children: "router", ".", and "get"

  // Check that the Router object is an instance of Router
  const routerName = expr.getChildAt(0)
  const symbol = checker.getSymbolAtLocation(routerName)
  if (!symbol) return false
  const type = checker.getTypeOfSymbolAtLocation(symbol, expr)
  if (checker.typeToString(type, expr) !== ROUTER_TYPE) return false

  // Check the method name
  if (expr.getChildCount() < 3) return false
  const methodName = expr.getChildAt(2)
  if (methodName.kind !== ts.SyntaxKind.Identifier) return false
  if (!ROUTER_METHODS.includes((methodName as ts.Identifier).text)) return false

  // Also check that the first argument is a string literal
  if (node.arguments[0].kind !== ts.SyntaxKind.StringLiteral) {
    logger.warn(sourceFile, node, 'Skipping router using something other than a string literal for defining the path')
    return false
  }

  return true
}

/**
 * Parses a single file
 * @param sourceFile the file to emit documentation for
 * @param program configuration of the top-level typescript project
 * @param generator translator for converting typescript types to JSON schemas
 * @param emitter used to write out documentation
 */
function documentSourceFile(sourceFile: ts.SourceFile, program: ts.Program,
                            generator: tjs.JsonSchemaGenerator, emitter: DocumentationEmitter) {

  const routersToRoutes = new Map<ts.Symbol, Documentation.Block[]>()
  sourceFile.forEachChild(lookForRoutes)
  for (const [router, routes] of routersToRoutes.entries()) {
    const routerDoc = parseRouterDoc(router, groupByRoute(routes))
    emitter.emit(routerDoc)
  }

  function lookForRoutes(node: ts.Node) {
    if (node.kind == ts.SyntaxKind.CallExpression) {
      const callexpr = node as ts.CallExpression
      if (isRouterFunction(sourceFile, callexpr, program.getTypeChecker())) {
        const route = (() => {
          try {
            return handleKoaRouter(callexpr, sourceFile, generator, emitter)
          } catch (e) {
            if (e instanceof NiceError) return undefined
            throw e
          }
        })()

        // We support multiple routers used in the same source file just in
        // case. The code below grabs the typescript symbol representing the
        // router used, and uses the symbol to group routes by their router.
        const sym = program.getTypeChecker().getSymbolAtLocation((callexpr).expression.getChildAt(0))
        if (!sym) throw new Error('Expected router variable to resolve to a symbol')
        if (!route) return

        // Add the route to the appropriate router
        let routeArray = routersToRoutes.get(sym)
        if (routeArray) {
          routeArray.push(route)
        } else {
          routeArray = [route]
          routersToRoutes.set(sym, routeArray)
        }
      }
    }
    node.forEachChild(lookForRoutes)
  }
}

function getPosition(sourceFile: ts.SourceFile, line: number): Position
function getPosition(sourceFile: ts.SourceFile, node: ts.Node): Position
function getPosition(sourceFile: ts.SourceFile, nodeOrLine: any): Position {
  const line = (typeof nodeOrLine === 'number') ?
    nodeOrLine :
    sourceFile.getLineAndCharacterOfPosition(nodeOrLine.getStart()).line
  return { line, sourceFile }
}

/**
 * Returns parsed documentation of a Router object's symbol by examing its JSDoc comment.
 */
function parseRouterDoc(router: ts.Symbol, routes: Documentation.Group[]): Documentation.Router {
  const routePaths = router.getJsDocTags().filter(t => t.name)
  if (routePaths.length > 1) throw new Error('Too many @route tags')
  const path = (routePaths[0] ? routePaths[0].text : null) || '/'
  const text = ts.displayPartsToString(router.getDocumentationComment(undefined))
  const [title, description] = splitByFirstNewline(text)
  return { path, title, description, routes }
}

/**
 * Parses a given AST node prepresenting a Koa router function, returning a
 * structure with parsed fields if the route is commented, otherwise undefined.
 */
function handleKoaRouter(node: ts.CallExpression, sourceFile: ts.SourceFile, generator: tjs.JsonSchemaGenerator, emitter: DocumentationEmitter): Documentation.Block|undefined {
  const method = (node.expression.getChildAt(2) as ts.Identifier).text
  const path = (node.arguments[0] as ts.StringLiteral).text
  const comments = ts.getLeadingCommentRanges(sourceFile.getText(), node.getFullStart()) || []
  const minLine = Math.min(...comments.map(c => sourceFile.getLineAndCharacterOfPosition(c.pos).line))
  const pos = getPosition(sourceFile, minLine)
  let commentText = ''
  for (const comment of comments) {
    commentText += sourceFile.getText().substring(comment.pos, comment.end)
  }
  const parsed = parse(commentText)
  if (parsed.length < 1) {
    logger.warn(sourceFile, node, `Ignoring undocumented route ${method.toUpperCase()} ${path}`)
    return undefined
  }

  const comment = parsed[0]
  const [title, rawDesc] = splitByFirstNewline(comment.description)
  const description = (rawDesc || '').trim()
  const urlParams = comment.tags.filter(t => t.tag === 'param').map(tag => parseParam(tag, false, emitter.config))
  const queryParams = comment.tags.filter(t => t.tag === 'query').map(tag => parseParam(tag, true, emitter.config))
  const params = urlParams.concat(queryParams)
  const responses = comment.tags.filter(t => t.tag == 'response').map(t => parseResponse(pos, generator, t, emitter))
  const bodies = comment.tags.filter(t => t.tag === 'body')
  if (bodies.length > 1) throw new Error('Too many @body tags')
  const body = bodies.length ? parseBody(pos, generator, bodies[0], emitter) : null

  /// interface TsType
  /// string
  ///
  /// @body {string}
  /// @body My text here
  ///
  /// @body {TsType} {application/json}

  /// @response {TsType}
  /// @response {text/html}
  return { method, path, title, description, params, responses, body }
}

/**
 * Parses a JSDoc @param tag
 */
function parseParam(tag: CommentParser.Tag, query: boolean, config: Config): Documentation.Param {
  const { name, type, description } = tag
  const examples = config.examples.param
  const example = examples.hasOwnProperty(name) ? examples[name] : config.defaults.string
  return { name, type, description, query, example }
}

/**
 * Parses a JSDoc @response tag
 */
function parseResponse(position: Position, generator: tjs.JsonSchemaGenerator, tag: CommentParser.Tag, emitter: DocumentationEmitter): Documentation.Response {
  const { name, type, description } = tag
  const responseCode = parseInt(name)
  if (isNaN(responseCode)) {
    logger.errLine(position.sourceFile, position.line + tag.line, `Error: Response code '${name}' should be a number.`)
    throw new NiceError()
  }
  let schema: tjs.Definition | null = null
  let body = null
  if (type && !type.includes('/')) {
    try {
      schema = generator.getSchemaForSymbol(type)
    } catch (e) {
      logger.errLine(position.sourceFile, position.line + tag.line, `Error: In generating schema for type ${type}, ${e.message}.`)
      throw new NiceError()
    }
    try {
      body = createSchemaExample(schema!, emitter.config)
    } catch (e) {
      logger.errLine(position.sourceFile, position.line + tag.line, `Error: ${e.message}. Schema: ${JSON.stringify(schema, null, 2)}`)
      throw new NiceError()
    }
  }

  // Add back leading whitespace to the description
  let adjustedDescription = description
  const whitespace = tag.source.match(new RegExp(responseCode + '(\\s*)'))
  if (whitespace && whitespace[1].includes('\n')) {
    adjustedDescription = '\n' + adjustedDescription
  }

  const splitDescription = splitByFirstNewline(adjustedDescription)
  return {
    code: responseCode,
    when: splitDescription[0] || null,
    type: schema ? 'application/json' : (type || null),
    body: splitDescription[1] || body,
    schema: schema
  }
}

function splitByFirstNewline(str: string): [string, string|undefined] {
  const nlindex = str.indexOf('\n')
  if (nlindex == -1) {
    return [str, undefined]
  } else {
    return [str.substring(0, nlindex), str.substring(nlindex + 1)]
  }
}

/**
 * Parses the @body tag
 *
 * @param tag the CommentParser Tag representing the @body tag
 */
function parseBody(position: Position, generator: tjs.JsonSchemaGenerator, tag: CommentParser.Tag, emitter: DocumentationEmitter): Documentation.RequestBody {
  // tag = { tag: 'body',
  // type: 'NeverDoWork',
  // name: '{application/json}',
  // optional: false,
  // description: '',
  // line: 3,
  // source: '@body {NeverDoWork} {application/json}' }
  let bodyContentType = null
  let bodyTypescriptType = null

  if (tag.type) {
    if (tag.type.includes('/')) bodyContentType = tag.type
    else bodyTypescriptType = tag.type
  }

  if (tag.name) {
    const tagContentMatch = tag.name.match(/^{(.*)}$/)
    if (!tagContentMatch) {
      logger.errLine(position.sourceFile, position.line + tag.line, `Error: @body tag should have types surrounded in curly braces.`)
      throw new NiceError()
    }
    const tagContent = tagContentMatch[1]
    if (tagContent.includes('/')) bodyContentType = tagContent
    else bodyTypescriptType = tagContent
  }

  let schema = null
  let body = null
  if (bodyTypescriptType) {
    try {
      schema = generator.getSchemaForSymbol(bodyTypescriptType)
    } catch (e) {
      logger.errLine(position.sourceFile, position.line + tag.line, `Error: In generating schema for type ${bodyTypescriptType}, ${e.message}.`)
      throw new NiceError()
    }
    try {
      body = createSchemaExample(schema!, emitter.config)
    } catch (e) {
      logger.errLine(position.sourceFile, position.line + tag.line, `Error: ${e.message}. Schema: ${JSON.stringify(schema, null, 2)}`)
      throw new NiceError()
    }
  }

  return {
    type: bodyContentType,
    body: tag.description || body,
    schema
  }
}

/**
 * Groups a given list of documentation routes by their path, maintaining their
 * order.
 */
function groupByRoute(docs: Documentation.Block[]): Documentation.Group[] {
  const groupMap = new Map<string, Documentation.Group>()
  const orderedGroups: Documentation.Group[] = []

  for (const doc of docs) {
    const group = groupMap.get(doc.path)
    if (group) {
      group.methods.push(doc)
    } else {
      const newGroup: Documentation.Group = {
        path: doc.path,
        methods: [doc]
      }
      groupMap.set(doc.path, newGroup)
      orderedGroups.push(newGroup)
    }
  }

  return orderedGroups
}
