const PATTERNS: { id: string; re: RegExp }[] = [
  { id: "ignore_instructions", re: /ignore (all |any |previous |prior )?instructions/i },
  { id: "system_prompt", re: /system prompt|developer message|you are now/i },
  { id: "override_rules", re: /override (the )?(application|safety|estimating) rules/i },
  { id: "force_approval", re: /approve (the )?estimate|mark (this|it) (as )?authorized|customer authorizes/i },
  { id: "invent_price", re: /set (the )?price to|add \$\d/i },
  { id: "hidden_instruction", re: /do not tell the (user|estimator)|act as (the )?estimator/i },
];

export type InjectionFlag = { id: string; excerpt: string };

export function screenText(text: string): InjectionFlag[] {
  const flags: InjectionFlag[] = [];
  for (const pattern of PATTERNS) {
    const match = text.match(pattern.re);
    if (match) flags.push({ id: pattern.id, excerpt: match[0] });
  }
  return flags;
}

/** Narration is evidence. Instruction-like phrases are stored and ignored as commands. */
export function narrationIsCommand(_text: string, flags: InjectionFlag[]): boolean {
  return flags.length > 0 ? false : false;
}
