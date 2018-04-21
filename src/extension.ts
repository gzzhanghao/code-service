import * as os from 'os'
import * as ws from 'ws'
import * as path from 'path'
import * as vscode from 'vscode'

let config = vscode.workspace.getConfiguration('codeservice')
let server: ws.Server|null = null

export function activate(context: vscode.ExtensionContext) {
    log('activate')
    restartServer()

    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('codeservice')) {
            log('configuration changed, reload configs')
            config = vscode.workspace.getConfiguration('codeservice')
        }
        if (event.affectsConfiguration('codeservice.serverPort')) {
            log('server port changed, restart server')
            restartServer()
        }
    })
}

export function deactivate() {
    log('deactivate')
    closeServer()
}

function restartServer() {
    closeServer()

    log('starting server')

    server = new ws.Server({ port: config.serverPort })

    server.on('listening', () => {
        log('server listening at port', config.serverPort)
    })

    server.on('error', error => {
        log('server error:', error.stack)
    })

    server.on('connection', socket => {
        log('connection established')

        socket.on('error', error => {
            log('connection error:', error.stack)
        })

        socket.once('close', () => {
            log('connection closed')
        })

        socket.on('message', async data => {
            try {
                log('message received', data)
                const msg = JSON.parse(data.toString())

                if (msg.type !== 'open') {
                    return
                }

                let basePath = config.basePaths || os.homedir()
                if ('project' in msg) {
                    basePath = basePath[msg.project]
                }

                const options: vscode.TextDocumentShowOptions = { preview: msg.preview !== false }
                const uri = vscode.Uri.file(path.join(basePath, msg.path))

                if (msg.range) {
                    const args: [number, number, number, number] = [
                        msg.range.line, msg.range.column || 0,
                        msg.range.line, msg.range.column || 0,
                    ]
                    if ('endLine' in msg.range) {
                        args[2] = msg.range.endLine
                    }
                    if ('endColumn' in msg.range) {
                        args[3] = msg.range.endColumn
                    }
                    options.selection = new vscode.Range(args[0], args[1], args[2], args[3])
                }

                await vscode.window.showTextDocument(uri, options)
            } catch (error) {
                log('open file error:', error.stack)
            }
        })
    })
}

function closeServer() {
    if (!server) {
        return
    }
    log('closing server')
    server.removeAllListeners()
    server.close()
    server = null
}

function log(...args: any[]) {
    if (config.debug) {
        console.log('[code-service]', ...args)
        vscode.debug.activeDebugConsole.appendLine(`[code-service] ${args.join(' ')}`)
    }
}
