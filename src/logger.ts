import * as ts from 'typescript'

const formatHost: ts.FormatDiagnosticsHost = {
    getCanonicalFileName: path => path,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine
}

/**
 * Prints an error from the typescript compiler.
 */
export function reportDiagnostic(diagnostic: ts.Diagnostic) {
    console.info(ts.formatDiagnosticsWithColorAndContext([diagnostic], formatHost))
}

/**
 * Prints a diagnostic every time the watch status changes.
 * This is mainly for messages like 'Starting compilation' or 'Compilation completed'.
 */
export function reportWatchStatusChanged(diagnostic: ts.Diagnostic) {
    console.info(ts.formatDiagnostic(diagnostic, formatHost))
}

/**
 * Nicely log an error to the console
 * @param category   The message severify (warning, error)
 * @param sourceFile The file the message is from
 * @param node       The node on which the message is positioned
 * @param message    The message to log
 * @param clipToLine Whether the clip the context at one line
 */
export function report(category: ts.DiagnosticCategory, sourceFile: ts.SourceFile, node: ts.Node, message: string, clipToLine=true) {
    const start = node.getStart()
    const end = Math.min(sourceFile.getLineEndOfPosition(start), node.getEnd())
    // @ts-ignore
    reportDiagnostic({
        category,
        // @ts-ignore
        code: '\b\bHDOC',
        file: sourceFile,
        start: node.getStart(),
        length: (clipToLine ? end : node.getEnd()) - node.getStart(),
        messageText: message
    })
}

/**
 * Nicely print a message from a line to the console
 * @param category   The message severify (warning, error)
 * @param sourceFile The file the message is from
 * @param line       The line the message is from
 * @param message    The message to log
 */
export function reportLine(category: ts.DiagnosticCategory, sourceFile: ts.SourceFile, line: number, message: string) {
    const start = sourceFile.getPositionOfLineAndCharacter(line, 0)
    // @ts-ignore
    reportDiagnostic({
        category,
        // @ts-ignore
        code: '\b\bHDOC',
        file: sourceFile,
        start,
        length: sourceFile.getLineEndOfPosition(start) - start,
        messageText: message
    })
}

export function err(sourceFile: ts.SourceFile, node: ts.Node, message: string) {
    report(ts.DiagnosticCategory.Error, sourceFile, node, message)
}
export function warn(sourceFile: ts.SourceFile, node: ts.Node, message: string) {
    report(ts.DiagnosticCategory.Warning, sourceFile, node, message)
}

export function errLine(sourceFile: ts.SourceFile, line: number, message: string) {
    reportLine(ts.DiagnosticCategory.Error, sourceFile, line, message)
}
export function warnLine(sourceFile: ts.SourceFile, line: number, message: string) {
    reportLine(ts.DiagnosticCategory.Warning, sourceFile, line, message)
}
