export type EntityType = "holdco" | "opco" | "management" | "asset" | "ip" | "vehicle";

export interface DiagramEntity {
  id: string;
  name: string;
  type: EntityType;
  description?: string;
  level: number;
  parent: string | null;
}

export interface DiagramConnection {
  from: string;
  to: string;
  label?: string;
}

export interface DiagramCapitalAccess {
  entity: string;
  instruments: string[];
}

export interface EntityDiagramData {
  type: "entity_diagram";
  title: string;
  subtitle?: string;
  entities: DiagramEntity[];
  connections: DiagramConnection[];
  notes?: string;
  capital_access?: DiagramCapitalAccess[];
}

export interface ExtractedDiagram {
  before: string;
  diagram: EntityDiagramData | null;
  after: string;
  raw?: string;
}

/**
 * Scans a message for a JSON block with type: "entity_diagram".
 * Supports raw JSON or fenced ```json blocks. Returns text before/after split out.
 */
export function extractEntityDiagram(content: string): ExtractedDiagram {
  if (!content || !content.includes('"entity_diagram"')) {
    return { before: content || "", diagram: null, after: "" };
  }

  // Try fenced code blocks first
  const fencedRe = /```(?:json)?\s*(\{[\s\S]*?"type"\s*:\s*"entity_diagram"[\s\S]*?\})\s*```/i;
  const fenced = content.match(fencedRe);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1]) as EntityDiagramData;
      if (parsed?.type === "entity_diagram" && Array.isArray(parsed.entities)) {
        const idx = content.indexOf(fenced[0]);
        return {
          before: content.slice(0, idx).trim(),
          diagram: parsed,
          after: content.slice(idx + fenced[0].length).trim(),
          raw: fenced[0],
        };
      }
    } catch {
      /* fall through */
    }
  }

  // Try raw JSON object containing the marker
  const start = content.indexOf("{");
  while (start !== -1) {
    // Greedy balanced-brace scan
    let depth = 0;
    let end = -1;
    let inStr = false;
    let esc = false;
    for (let i = start; i < content.length; i++) {
      const ch = content[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) break;
    const candidate = content.slice(start, end + 1);
    if (candidate.includes('"entity_diagram"')) {
      try {
        const parsed = JSON.parse(candidate) as EntityDiagramData;
        if (parsed?.type === "entity_diagram" && Array.isArray(parsed.entities)) {
          return {
            before: content.slice(0, start).trim(),
            diagram: parsed,
            after: content.slice(end + 1).trim(),
            raw: candidate,
          };
        }
      } catch {
        /* fall through and try the next opening brace */
      }
    }
    const next = content.indexOf("{", start + 1);
    if (next === -1 || next === start) break;
    // restart loop with next opening brace
    return extractEntityDiagram(content.slice(next));
  }

  return { before: content, diagram: null, after: "" };
}
