import * as vscode from 'vscode';
import { extractReferenceAtPosition, findCorrespondingTsFile, findDefinitionInTsFile } from './templateParser';

export class SolelyDefinitionProvider implements vscode.DefinitionProvider {
    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
    ): Promise<vscode.Definition | null> {
        const ref = extractReferenceAtPosition(document, position);
        if (!ref) {
            return null;
        }

        const tsPath = findCorrespondingTsFile(document.fileName);
        if (!tsPath) {
            return null;
        }

        const location = findDefinitionInTsFile(tsPath, ref);
        if (location) {
            return location;
        }

        return null;
    }
}
