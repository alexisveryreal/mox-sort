import * as z from "zod";


const CardSchema = z.object({
  name: z.string(),
  type_line: z.string().nullish().transform((val) => val ?? "Unknown")
});

const EntrySchema = z.object({
  quantity: z.number().nullish().transform((val) => val ?? 1),
  card: CardSchema,
})

const DeckSchema = z.object({
  commanders: z.record(z.string(), EntrySchema).nullish().transform((val) => val ?? {}),
  mainboard: z.record(z.string(), EntrySchema).nullish().transform((val) => val ?? {}),
  boards: z.object({
      commanders: z.object({ cards: z.record(z.string(), EntrySchema).nullish().transform((val) => val ?? {}) }).nullish(),
      mainboard: z.object({ cards: z.record(z.string(), EntrySchema).nullish().transform((val) => val ?? {}) }).nullish(),
    }).nullish(),
})

// --- 2. Configuration & Types ---

const TYPE_ORDER = [
  "Commander",
  "Planeswalker",
  "Creature",
  "Sorcery",
  "Instant",
  "Artifact",
  "Enchantment",
  "Battle",
  "Land",
  "Unknown"
];

interface FormattedEntry {
  name: string;
  quantity: number;
  type: string;
}

// --- 3. Helper Functions ---

function getDeckId(input: string): string {
  const match = input.match(/decks\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] ?? "" : input;
}

function getPrimaryType(typeLine: string): string {
  if (!typeLine) return "Unknown";

  if (typeLine.includes("Planeswalker")) return "Planeswalker";
  if (typeLine.includes("Creature")) return "Creature";
  if (typeLine.includes("Sorcery")) return "Sorcery";
  if (typeLine.includes("Instant")) return "Instant";
  if (typeLine.includes("Artifact")) return "Artifact";
  if (typeLine.includes("Enchantment")) return "Enchantment";
  if (typeLine.includes("Battle")) return "Battle";
  if (typeLine.includes("Land")) return "Land";

  return "Unknown";
}

// --- 4. Main Execution ---

async function generateSortedDecklist(moxfieldUrl: string) {
  const deckId = getDeckId(moxfieldUrl);
  const apiUrl = `https://api2.moxfield.com/v2/decks/all/${deckId}`;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`Failed to fetch deck: ${response.statusText}`);

    const rawData = await response.json();

    // Validate and type-cast the raw JSON using Zod
    const data = DeckSchema.parse(rawData);

    const deckEntries: FormattedEntry[] = [];

    // Combine standard keys and fallback `boards` keys safely
    const commandersMap = Object.keys(data.commanders).length > 0
      ? data.commanders
      : data.boards?.commanders?.cards || {};

    const mainboardMap = Object.keys(data.mainboard).length > 0
      ? data.mainboard
      : data.boards?.mainboard?.cards || {};

    // 1. Process Commanders
    for (const entry of Object.values(commandersMap)) {
      deckEntries.push({
        name: entry.card.name,
        quantity: entry.quantity,
        type: "Commander" // Force type to Commander for this bucket
      });
    }

    // 2. Process Mainboard
    for (const entry of Object.values(mainboardMap)) {
      deckEntries.push({
        name: entry.card.name,
        quantity: entry.quantity,
        type: getPrimaryType(entry.card.type_line)
      });
    }

    // 3. Sort by Type, then Alphabetically by Name
    deckEntries.sort((a, b) => {
      const typeDiff = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
      if (typeDiff !== 0) return typeDiff;

      return a.name.localeCompare(b.name);
    });

    // 4. Format Output
    const plaintext = deckEntries
      .map((entry) => `${entry.quantity} ${entry.name}`)
      .join("\n");

    console.log(plaintext);

  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Zod Validation Failed. Moxfield API structure might have changed:");
      console.error(z.treeifyError(error));
    } else {
      console.error("Error processing deck:", error);
    }
  }
}

// --- Run ---
const targetUrl = process.argv[2] || "https://www.moxfield.com/decks/YOUR_DECK_ID_HERE";

if (targetUrl.includes("YOUR_DECK_ID_HERE")) {
  console.log("Usage: bun run index.ts <moxfield_url>");
} else {
  generateSortedDecklist(targetUrl);
}
