'use strict';

const API = 'https://api.github.com';

class GitHubStorageError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GitHubStorageError';
    this.status = status || 502;
  }
}

function config() {
  const token = String(process.env.GITHUB_DATA_TOKEN || '').trim();
  const repo = String(process.env.GITHUB_DATA_REPO || '').trim();
  if (!token && !repo) return null;
  if (!token || !repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new GitHubStorageError('Configuration du dépôt GitHub incomplète.', 503);
  }
  return {token, repo, branch: String(process.env.GITHUB_DATA_BRANCH || 'main').trim() || 'main'};
}

function fileUrl(cfg, path) {
  const encoded = String(path).split('/').map(encodeURIComponent).join('/');
  return `${API}/repos/${cfg.repo}/contents/${encoded}?ref=${encodeURIComponent(cfg.branch)}`;
}

async function request(cfg, url, options) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${cfg.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ms-plomberie-shared-storage',
        ...(options && options.headers || {})
      }
    });
  } catch (_) {
    throw new GitHubStorageError('GitHub est temporairement inaccessible.', 502);
  }
  return response;
}

async function assertPrivateRepository(cfg) {
  const response = await request(cfg, `${API}/repos/${cfg.repo}`, {method: 'GET', cache: 'no-store'});
  if (!response.ok) {
    if (response.status === 404 || response.status === 401 || response.status === 403) {
      throw new GitHubStorageError('Le dépôt GitHub privé est introuvable ou le jeton n’y a pas accès.', 503);
    }
    throw new GitHubStorageError('Impossible de vérifier le dépôt GitHub.', 502);
  }
  const repository = await response.json();
  if (!repository || repository.private !== true) {
    throw new GitHubStorageError('Le dépôt de données doit être privé.', 503);
  }
}

async function readFile(cfg, path) {
  const url = fileUrl(cfg, path);
  const response = await request(cfg, url, {method: 'GET', cache: 'no-store'});
  if (response.status === 404) return null;
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new GitHubStorageError('Le jeton GitHub doit avoir accès en lecture au dépôt privé.', 503);
    throw new GitHubStorageError('Impossible de lire les données sur GitHub.', 502);
  }
  const file = await response.json();
  if (!file || !file.sha || typeof file.size !== 'number') throw new GitHubStorageError('Le fichier GitHub est illisible.', 502);
  let bytes;
  if (file.encoding === 'base64' && typeof file.content === 'string') {
    bytes = Buffer.from(file.content.replace(/\s/g, ''), 'base64');
  } else {
    const raw = await request(cfg, url, {method: 'GET', headers: {Accept: 'application/vnd.github.raw+json'}, cache: 'no-store'});
    if (!raw.ok) throw new GitHubStorageError('Impossible de lire le fichier de données GitHub.', 502);
    bytes = Buffer.from(await raw.arrayBuffer());
  }
  return {bytes, sha: String(file.sha)};
}

async function writeFile(cfg, path, bytes, sha, message) {
  const body = {
    message: message || 'Save shared app data',
    content: Buffer.from(bytes).toString('base64'),
    branch: cfg.branch
  };
  if (sha) body.sha = sha;
  const response = await request(cfg, fileUrl(cfg, path).split('?')[0], {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
    cache: 'no-store'
  });
  if (response.status === 409 || response.status === 422) throw new GitHubStorageError('Les données GitHub ont changé sur un autre appareil.', 409);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new GitHubStorageError('Le jeton GitHub doit avoir le droit Contents: read and write sur le dépôt privé.', 503);
    throw new GitHubStorageError('Échec de l’enregistrement sur GitHub.', 502);
  }
  const result = await response.json();
  const blobSha = result && result.content && result.content.sha;
  if (!blobSha) throw new GitHubStorageError('GitHub n’a pas confirmé l’enregistrement.', 502);
  return String(blobSha);
}

async function readText(cfg, path) {
  const file = await readFile(cfg, path);
  if (!file) return null;
  return {text: file.bytes.toString('utf8'), sha: file.sha};
}

module.exports = {GitHubStorageError, config, assertPrivateRepository, readFile, readText, writeFile};
