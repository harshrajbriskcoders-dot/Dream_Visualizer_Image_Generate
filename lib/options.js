// The three questions shown on the form. The Shopify section loads these from /api/options,
// so this file is the only place to edit them.
//
// label  = what visitors see
// prompt = the words added to the AI prompt when that answer is picked
// multi  = checkboxes (true) or a single choice (false)
// max    = most answers a visitor can pick (multi only)
//
// Replace these placeholder options with the client's final list.

export const QUESTIONS = {
  houseStyle: {
    label: 'What style is your house?',
    hint: 'Pick up to 2.',
    multi: true,
    max: 2,
    options: [
      { id: 'modern', label: 'Modern', prompt: 'modern' },
      { id: 'farmhouse', label: 'Farmhouse', prompt: 'modern farmhouse' },
      { id: 'craftsman', label: 'Craftsman', prompt: 'craftsman' },
      { id: 'traditional', label: 'Traditional', prompt: 'traditional' },
      { id: 'colonial', label: 'Colonial', prompt: 'colonial' },
      { id: 'ranch', label: 'Ranch', prompt: 'ranch-style' },
      { id: 'coastal', label: 'Coastal', prompt: 'coastal' },
      { id: 'mediterranean', label: 'Mediterranean', prompt: 'Mediterranean' },
      { id: 'rustic', label: 'Rustic or cabin', prompt: 'rustic mountain cabin' },
      { id: 'contemporary', label: 'Contemporary', prompt: 'contemporary' },
    ],
  },

  // The client asked for multi-select here. A home sits on one lot, so this is single choice.
  // To allow several answers, set multi: true and add max.
  lotSize: {
    label: 'How big is your lot?',
    hint: 'Pick one.',
    multi: false,
    options: [
      { id: 'small', label: 'Small (under ¼ acre)', prompt: 'small, compact lot' },
      { id: 'medium', label: 'Medium (¼ to ½ acre)', prompt: 'medium-sized lot' },
      { id: 'large', label: 'Large (½ to 1 acre)', prompt: 'large lot with generous space' },
      { id: 'xlarge', label: 'Over 1 acre', prompt: 'very large, open property' },
    ],
  },

  features: {
    label: 'What do you want included?',
    hint: 'Pick up to 5. Every design includes a composite deck, timber frame and railing.',
    multi: true,
    max: 5,
    options: [
      { id: 'shade', label: 'Shade or covered area', prompt: 'a shaded seating area under a solid roof' },
      { id: 'kitchen', label: 'Outdoor kitchen', prompt: 'an outdoor kitchen with a built-in grill and counters' },
      { id: 'firepit', label: 'Fire pit', prompt: 'a fire pit surrounded by seating' },
      { id: 'dining', label: 'Dining area', prompt: 'an outdoor dining table for six' },
      { id: 'lounge', label: 'Lounge seating', prompt: 'comfortable outdoor lounge sofas' },
      { id: 'lighting', label: 'Lighting', prompt: 'warm string lights and step lighting' },
      { id: 'hottub', label: 'Hot tub', prompt: 'a built-in hot tub' },
      { id: 'multilevel', label: 'Multi-level deck', prompt: 'a multi-level deck with wide stairs' },
      { id: 'privacy', label: 'Privacy screen', prompt: 'a slatted privacy screen' },
      { id: 'plants', label: 'Plants and landscaping', prompt: 'lush planters and landscaping' },
    ],
  },
};

export const QUESTION_KEYS = Object.keys(QUESTIONS);

export function findOption(key, id) {
  return QUESTIONS[key]?.options.find((o) => o.id === id) || null;
}

export function labelsFor(key, ids = []) {
  return ids.map((id) => findOption(key, id)?.label).filter(Boolean);
}

export function promptsFor(key, ids = []) {
  return ids.map((id) => findOption(key, id)?.prompt).filter(Boolean);
}

// What the browser receives: no prompt text.
export function publicQuestions() {
  const out = {};
  for (const [key, q] of Object.entries(QUESTIONS)) {
    out[key] = {
      label: q.label,
      hint: q.hint || '',
      multi: q.multi,
      max: q.multi ? q.max || q.options.length : 1,
      options: q.options.map(({ id, label }) => ({ id, label })),
    };
  }
  return out;
}
