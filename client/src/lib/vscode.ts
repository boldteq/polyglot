// Deep-link that opens an absolute path in VS Code. Shared by the workspace
// components that surface a build's repo path (ProjectHeader, RepoPanel).
export const vscodeLink = (abs: string) => `vscode://file${abs}`
