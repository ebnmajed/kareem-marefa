"use client";

import { createContext, useContext, useRef, useState, type MutableRefObject, type ReactNode } from "react";

// What this client has submitted on SCR-014, and which submission has been answered — DEC-212's cue for the
// mistyped code's shake. Not a moment and not a moment's key.
//
// ★ IT LIVES IN THE ROUTE'S LAYOUT, NOT THE PAGE. A refusal arrives as the action's redirect to `?error=…`, and
// Next keys a page segment by its search params, so the page — the form, the boxes, any state in them — is a NEW
// mount after every refusal (measured on a production build: the form before the submission is no longer in the
// document after it). A layout survives a change of search params and is unmounted when the member leaves the
// route, so the count survives the refusal it was made for, and a reload, a cold `?error=` link or an arrival from
// elsewhere starts from nothing — which is what keeps a refused page from shaking when it was not just submitted.

type Submissions = {
  /** How many times this client has submitted the code. */
  submissions: number;
  submitted: () => void;
  /** The last submission whose answer has been rendered — shared, so a remounted page does not answer it twice. */
  answered: MutableRefObject<number>;
};

const SubmissionsContext = createContext<Submissions>({ submissions: 0, submitted: () => {}, answered: { current: 0 } });

export function SubmissionsProvider({ children }: { children: ReactNode }) {
  const [submissions, setSubmissions] = useState(0);
  const answered = useRef(0);
  return <SubmissionsContext.Provider value={{ submissions, submitted: () => setSubmissions((n) => n + 1), answered }}>{children}</SubmissionsContext.Provider>;
}

export function useSubmissions(): Submissions {
  return useContext(SubmissionsContext);
}
