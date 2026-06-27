import { Helmet } from "react-helmet-async";

interface PageHeadProps {
  title: string;
  description: string;
  path: string;
  image?: string;
}

/**
 * Per-route head metadata. Sets title, description, canonical, and og:* tags
 * that self-reference the route. Sitewide og:image fallback lives in
 * index.html for social-preview crawlers that don't run JS.
 */
export function PageHead({ title, description, path, image }: PageHeadProps) {
  const url = `https://paigeagent.ai${path}`;
  const og = image ?? "https://paigeagent.ai/og-image.jpg";
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={og} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={og} />
    </Helmet>
  );
}

export default PageHead;
