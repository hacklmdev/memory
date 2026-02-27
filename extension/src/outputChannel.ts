import * as vscode from 'vscode';

let _channel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  _channel ??= vscode.window.createOutputChannel('HackLM Memory');
  return _channel;
}

export function disposeOutputChannel(): void {
  _channel?.dispose();
  _channel = undefined;
}
