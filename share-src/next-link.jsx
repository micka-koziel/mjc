// Remplaçant de next/link pour la page unique partagée (simple lien).
export default function Link({ href, children, ...rest }) {
  return <a href={href} {...rest}>{children}</a>;
}
