/**
 * Contrat de la couche « services » — ce que l'interface attend des données.
 *
 * Deux implémentations, mêmes signatures :
 *  - demo     (src/services/demo)     : données fictives en mémoire + IA simulée.
 *                                      Rien n'est envoyé, rien n'est supprimé
 *                                      ailleurs que dans le navigateur.
 *  - firebase (src/services/firebase) : Firestore + Cloud Functions du dossier
 *                                      `functions/` (Gmail réel, IA réelle).
 * Choix par NEXT_PUBLIC_DATA_MODE (« demo » par défaut).
 *
 * @typedef {object} MailService
 * @property {'demo'|'firebase'} mode
 * @property {(cb: (user: object|null) => void) => () => void} onAuth
 * @property {() => Promise<void>} signIn       connexion (Google en réel)
 * @property {() => Promise<void>} signOut
 * @property {(cb: (state: {messages: object[], loading: boolean, error: Error|null}) => void) => () => void} subscribeMessages
 * @property {(query: string) => Promise<{messages: object[]}>} searchMessages   recherche étendue (toutes dates)
 * @property {(messageId: string, action: 'trash'|'spam'|'archive'|'mark_read') => Promise<object>} applyAction
 * @property {(threadId: string, messages: object[]) => Promise<{summary: string, keyPoints: string[], status: string, simulated?: boolean}>} summarizeThread
 * @property {(messageId: string) => Promise<object|null>} getExistingDraft
 * @property {(messageId: string, opts: {instruction?: string, assistant?: object}) => Promise<object>} generateReplyDraft
 * @property {(messageId: string, file: File) => Promise<{storagePath: string, filename: string, sizeBytes: number, mimeType: string}>} uploadAttachment
 * @property {(p: {messageId: string, text: string, subject: string, recipients: string, cc?: string, bcc?: string, attachments?: object[]}) => Promise<{ok: true, simulated?: boolean}>} sendReply
 * @property {(hours: number) => Promise<{summary_text: string, items: object[], simulated?: boolean}>} summarizeRecent
 * @property {(cb: (state: {todos: object[], loading: boolean}) => void) => () => void} subscribeTodos
 * @property {(todo: object) => Promise<string>} createTodo
 * @property {(id: string, patch: object) => Promise<void>} updateTodo
 * @property {(id: string) => Promise<void>} deleteTodo
 * @property {(p: {question: string, conversationId?: string, assistant?: object}) => Promise<{conversationId: string, text: string, actions?: {title: string, threadId: string|null, due: string|null, kind: 'repondre'|'ouvrir'|'tache'}[]}>} askAssistant
 * @property {() => void} [resetDemo]          démo uniquement
 */

export const SERVICE_METHODS = Object.freeze([
  'onAuth',
  'signIn',
  'signOut',
  'subscribeMessages',
  'searchMessages',
  'applyAction',
  'summarizeThread',
  'getExistingDraft',
  'generateReplyDraft',
  'uploadAttachment',
  'sendReply',
  'summarizeRecent',
  'subscribeTodos',
  'createTodo',
  'updateTodo',
  'deleteTodo',
  'askAssistant',
]);
