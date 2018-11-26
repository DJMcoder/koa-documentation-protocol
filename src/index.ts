/**
 * This version of the script acts like tsc --watch, except it outputs
 * documentation in addition to code.
 */
import { execSync } from 'child_process'
import ts from 'typescript'
import * as yargs from 'yargs'

import { Config, parseConfig } from './config'
import { DocumentationEmitter } from './emitter'
import { NiceError } from './errors'
import { reportDiagnostic, reportWatchStatusChanged, report } from './logger'
import { createDocumentation } from './parser'

const DEFAULT_CONFIG = './docconfig.json'

const argv = yargs
    .usage('Usage: $0 [options]')
    .example('$0 -p docconfig.json', 'Compile with parameters described in doccconfig.json')
    .alias('p', 'project')
    .describe('p', 'Path to a docconfig.json file describing documentation compilation parameters')
    .nargs('p', 1)
    .help('h')
    .alias('h', 'help')
    .alias('w', 'watch')
    .describe('w', 'Watch input files')
    .boolean('w')
    .argv

try {
    let config = parseConfig(argv.project || DEFAULT_CONFIG)
    watchMain(config)
} catch (e) {
    if (!(e instanceof NiceError)) throw e
    console.error(e.message)
}

// Runs the watcher
function watchMain(config: Config) {
    const configPath = ts.findConfigFile(
        './',
        ts.sys.fileExists,
        'tsconfig.json'
    )
    if (!configPath) {
        throw new Error('Could not find a valid \'tsconfig.json\'.')
    }

    // TypeScript can use several different program creation 'strategies':
    //    * ts.createEmitAndSemanticDiagnosticsBuilderProgram,
    //    * ts.createSemanticDiagnosticsBuilderProgram
    //    * ts.createAbstractBuilder
    // The first two produce 'builder programs'. These use an incremental strategy
    // to only re-check and emit files whose contents may have changed, or whose
    // dependencies may have changes which may impact change the result of prior
    // type-check and emit.
    // The last uses an ordinary program which does a full type check after every
    // change.
    // Between `createEmitAndSemanticDiagnosticsBuilderProgram` and
    // `createSemanticDiagnosticsBuilderProgram`, the only difference is emit.
    // For pure type-checking scenarios, or when another tool/process handles emit,
    // using `createSemanticDiagnosticsBuilderProgram` may be more desirable.
    const createProgram = ts.createSemanticDiagnosticsBuilderProgram

    // Note that there is another overload for `createWatchCompilerHost` that takes
    // a set of root files.
    const host = ts.createWatchCompilerHost(
        configPath,
        {},
        ts.sys,
        createProgram,
        reportDiagnostic,
        reportWatchStatusChanged
    )

    // You can technically override any given hook on the host, though you probably
    // don't need to.
    // Note that we're assuming `origCreateProgram` and `origPostProgramCreate`
    // doesn't use `this` at all.
    const origCreateProgram = host.createProgram
    host.createProgram = (
        rootNames: ReadonlyArray<string>|undefined,
        options,
        host,
        oldProgram
    ) => {
        // console.log('info', '', 'Creating program...')
        // Here we have access to the names of the typscript files that will bget compiled
        // We could use the ts.createSourceFile function for each to get the AST for each file.
        // const program = ts.createProgram(rootNames || [], options || {})
        // createDocumentation(createSourceFiles(rootNames || []), program)
        // process.exit(0) // After we do our work just quit
        return origCreateProgram(rootNames, options, host, oldProgram)
    }
    const origPostProgramCreate = host.afterProgramCreate

    host.afterProgramCreate = program => {
        config = parseConfig(argv.project || DEFAULT_CONFIG)
        origPostProgramCreate!(program)
        const emitter = new DocumentationEmitter(config)
        createDocumentation(program.getSourceFiles(), program.getProgram(), emitter)
        emitter.close().then(() => {
            if (config.afterHook) execSync(config.afterHook)
            if (!argv.watch) process.exit(0)
        })
        .catch(console.error);
    }

    // `createWatchProgram` creates an initial program, watches files, and updates
    // the program over time.
    ts.createWatchProgram(host)
}
