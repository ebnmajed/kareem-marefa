"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { Sheet } from "@/components/ui/sheet";

// «رسالة جديدة» — wave 23, REQ-UIX-112, the plan's D9. ★ The message set is `08` §1's and every message already has a
// card, so nothing new is CREATED: the sheet lists the same keys, the ones still on the platform design first, and
// choosing one opens its builder. A key `08` does not list cannot be reached from here.

export interface NewMessageProps {
  label: string;
  title: string;
  listLabel: string;
  ownLabel: string;
  platformLabel: string;
  messages: readonly { key: string; name: string; own: boolean }[];
}

export function NewMessage({ label, title, listLabel, ownLabel, platformLabel, messages }: NewMessageProps) {
  const [open, setOpen] = useState(false);
  const ordered = [...messages].sort((a, b) => Number(a.own) - Number(b.own));
  return (
    <>
      <Button type="button" variant="primary" size="md" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={title} side="inline-end">
        <ul aria-label={listLabel} className="flex flex-col gap-1">
          {ordered.map((message) => (
            <li key={message.key}>
              <Link href={`/app/admin/emails/${message.key}`} className="flex min-h-11 items-center gap-2 rounded-field px-2 text-body-sm text-fg-heading hover:bg-hover">
                <span className="min-w-0 flex-1">{message.name}</span>
                <Badge size="sm" tone={message.own ? "success" : "neutral"} outline={!message.own}>
                  {message.own ? ownLabel : platformLabel}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
