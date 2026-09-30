import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addTradeOption } from "@/lib/operations.functions";
import { useRefreshWorkspace, useWorkspace } from "@/lib/workspace";

export function parseCategories(value?: string | null): string[] {
  return (value ?? "")
    .split(/[+,/]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function joinCategories(list: string[]): string {
  return Array.from(new Set(list.map((item) => item.trim()).filter(Boolean))).join(" + ");
}

export function hasAllCategories(value: string | null | undefined, wanted: string[]): boolean {
  const owned = parseCategories(value).map((item) => item.toLowerCase());
  return wanted.every((item) => owned.includes(item.trim().toLowerCase()));
}

export function useTradeOptions() {
  const workspace = useWorkspace();
  const trades = workspace.data?.trades ?? [];
  const tradeCategories = workspace.data?.tradeCategories ?? [];
  const candidates = workspace.data?.candidates ?? [];

  return useMemo(() => {
    const names = new Set<string>();
    for (const trade of trades) names.add(trade.name);
    for (const candidate of candidates) if (candidate.trade) names.add(candidate.trade);

    const categoriesByTrade = new Map<string, Set<string>>();
    const add = (trade: string, category: string) => {
      const key = trade.toLowerCase();
      if (!categoriesByTrade.has(key)) categoriesByTrade.set(key, new Set());
      categoriesByTrade.get(key)!.add(category);
    };
    for (const category of tradeCategories) {
      const trade = trades.find((item) => item.id === category.trade_id);
      if (trade) add(trade.name, category.name);
    }
    for (const candidate of candidates) {
      if (!candidate.trade) continue;
      for (const item of parseCategories(candidate.category)) add(candidate.trade, item);
    }

    return {
      tradeNames: Array.from(names).sort((a, b) => a.localeCompare(b)),
      categoriesFor: (trade: string) => Array.from(categoriesByTrade.get((trade ?? "").toLowerCase()) ?? []).sort((a, b) => a.localeCompare(b)),
      allCategories: Array.from(new Set(Array.from(categoriesByTrade.values()).flatMap((set) => Array.from(set)))).sort((a, b) => a.localeCompare(b)),
    };
  }, [trades, tradeCategories, candidates]);
}

export function TradeCategorySelect({
  trade,
  category,
  onChange,
  allowAdd = true,
}: {
  trade: string;
  category: string;
  onChange: (next: { trade: string; category: string }) => void;
  allowAdd?: boolean;
}) {
  const { tradeNames, categoriesFor } = useTradeOptions();
  const saveOption = useServerFn(addTradeOption);
  const refresh = useRefreshWorkspace();
  const [adding, setAdding] = useState<"trade" | "category" | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const categories = categoriesFor(trade);

  async function commit() {
    const value = draft.trim();
    if (!value) return;
    setBusy(true);
    try {
      if (adding === "trade") {
        await saveOption({ data: { trade: value } });
        onChange({ trade: value, category: "" });
      } else {
        if (trade.trim().length >= 2) await saveOption({ data: { trade: trade.trim(), category: value } });
        onChange({ trade, category: value });
      }
      refresh();
      setDraft("");
      setAdding(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div>
        <div className="flex gap-2">
          <Select value={trade || "none"} onValueChange={(value) => onChange({ trade: value === "none" ? "" : value, category: "" })}>
            <SelectTrigger><SelectValue placeholder="Trade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No trade</SelectItem>
              {tradeNames.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          {allowAdd ? (
            <Button type="button" variant="outline" size="icon" aria-label="Add a new trade" onClick={() => { setAdding(adding === "trade" ? null : "trade"); setDraft(""); }}>
              <Plus className="size-4" />
            </Button>
          ) : null}
        </div>
        {adding === "trade" ? (
          <div className="mt-2 flex gap-2">
            <Input autoFocus placeholder="New trade name" value={draft} onChange={(event) => setDraft(event.target.value)} />
            <Button type="button" size="sm" disabled={busy || draft.trim().length < 2} onClick={() => void commit()}>Add</Button>
          </div>
        ) : null}
      </div>

      <div>
        <div className="flex gap-2">
          <Select value={category || "none"} onValueChange={(value) => onChange({ trade, category: value === "none" ? "" : value })} disabled={!trade}>
            <SelectTrigger><SelectValue placeholder={trade ? "Category" : "Pick a trade first"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No category</SelectItem>
              {categories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          {allowAdd ? (
            <Button type="button" variant="outline" size="icon" aria-label="Add a new category" disabled={!trade} onClick={() => { setAdding(adding === "category" ? null : "category"); setDraft(""); }}>
              <Plus className="size-4" />
            </Button>
          ) : null}
        </div>
        {adding === "category" ? (
          <div className="mt-2 flex gap-2">
            <Input autoFocus placeholder="New category" value={draft} onChange={(event) => setDraft(event.target.value)} />
            <Button type="button" size="sm" disabled={busy || !draft.trim()} onClick={() => void commit()}>Add</Button>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function CategoryMultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Categories",
  disabled = false,
  onAdd,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  onAdd?: (value: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const lower = selected.map((item) => item.toLowerCase());
  const label = selected.length === 0 ? placeholder : selected.length <= 2 ? selected.join(" + ") : `${selected.length} categories`;

  function toggle(item: string) {
    if (lower.includes(item.toLowerCase())) onChange(selected.filter((entry) => entry.toLowerCase() !== item.toLowerCase()));
    else onChange([...selected, item]);
  }

  async function addNew() {
    const value = draft.trim();
    if (!value) return;
    setBusy(true);
    try {
      if (onAdd) await onAdd(value);
      if (!lower.includes(value.toLowerCase())) onChange([...selected, value]);
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled} className="w-full justify-between font-normal">
          <span className={selected.length ? "" : "text-muted-foreground"}>{label}</span>
          <ChevronDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="max-h-56 overflow-y-auto">
          {options.length === 0 ? <p className="px-2 py-1.5 text-sm text-muted-foreground">No categories yet</p> : null}
          {options.map((item) => {
            const active = lower.includes(item.toLowerCase());
            return (
              <button
                key={item}
                type="button"
                onClick={() => toggle(item)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span>{item}</span>
                {active ? <Check className="size-4 text-primary" /> : null}
              </button>
            );
          })}
        </div>
        {onAdd ? (
          <div className="mt-2 flex gap-2 border-t border-border pt-2">
            <Input placeholder="New category" value={draft} onChange={(event) => setDraft(event.target.value)} />
            <Button type="button" size="sm" disabled={busy || !draft.trim()} onClick={() => void addNew()}>Add</Button>
          </div>
        ) : null}
        {selected.length ? (
          <Button type="button" variant="ghost" size="sm" className="mt-2 w-full" onClick={() => onChange([])}>Clear</Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function TradeCategoryMultiSelect({
  trade,
  categories,
  onChange,
}: {
  trade: string;
  categories: string[];
  onChange: (next: { trade: string; categories: string[] }) => void;
}) {
  const { tradeNames, categoriesFor } = useTradeOptions();
  const saveOption = useServerFn(addTradeOption);
  const refresh = useRefreshWorkspace();
  const [addingTrade, setAddingTrade] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const options = categoriesFor(trade);

  async function commitTrade() {
    const value = draft.trim();
    if (value.length < 2) return;
    setBusy(true);
    try {
      await saveOption({ data: { trade: value } });
      onChange({ trade: value, categories: [] });
      refresh();
      setDraft("");
      setAddingTrade(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div>
        <div className="flex gap-2">
          <Select value={trade || "none"} onValueChange={(value) => onChange({ trade: value === "none" ? "" : value, categories: [] })}>
            <SelectTrigger><SelectValue placeholder="Trade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No trade</SelectItem>
              {tradeNames.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="icon" aria-label="Add a new trade" onClick={() => { setAddingTrade(!addingTrade); setDraft(""); }}>
            <Plus className="size-4" />
          </Button>
        </div>
        {addingTrade ? (
          <div className="mt-2 flex gap-2">
            <Input autoFocus placeholder="New trade name" value={draft} onChange={(event) => setDraft(event.target.value)} />
            <Button type="button" size="sm" disabled={busy || draft.trim().length < 2} onClick={() => void commitTrade()}>Add</Button>
          </div>
        ) : null}
      </div>

      <CategoryMultiSelect
        options={options}
        selected={categories}
        disabled={!trade}
        placeholder={trade ? "Categories" : "Pick a trade first"}
        onChange={(next) => onChange({ trade, categories: next })}
        onAdd={async (value) => {
          if (trade.trim().length >= 2) {
            await saveOption({ data: { trade: trade.trim(), category: value } });
            refresh();
          }
        }}
      />
    </>
  );
}
