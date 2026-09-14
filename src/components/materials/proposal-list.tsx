import { getTranslations } from "next-intl/server";
import { getProposalMaterialsPageData } from "@/lib/dal/materials";
import { formatNumber } from "@/components/sessions/numerals";
import { UploadForm } from "@/components/materials/upload-form";

interface ProposalMaterialsProps {
  proposalId: string;
  // Optional: the slot reads for the session's own member (the cookie is the authority).
  memberId?: string;
  locale: string;
}

/** `<ProposalMaterials proposalId memberId locale />` — REQ-PRO-004: draft materials attached to a
 *  proposal, visible only to admins and the proposal's own owner/co-presenter until it becomes a
 *  session (`materials_read`'s proposal branch, proposed/content/0009). No `<section>/<h2>` of its
 *  own — the propose screen owns the landmark, same convention as the session-side slots.
 *
 *  Deliberately minimal compared to `Materials` (src/components/materials/list.tsx): a draft
 *  proposal's materials are never converted/rendered (finalize_material_upload defers the
 *  `convert_document` enqueue until carry-over, since there is no session_id yet to build a
 *  storage path from), so there is no viewer link and no phase/allow_download toggle to show —
 *  "obey every materials rule" (REQ-PRO-004) is a property of the shared upload/sniff/limit
 *  pipeline this reuses, not of this component's own UI. */
export async function ProposalMaterials({ proposalId, locale }: ProposalMaterialsProps) {
  const t = await getTranslations("materials.list");
  const { materials, numerals, canManage } = await getProposalMaterialsPageData(locale, proposalId);

  if (materials.length === 0) {
    return (
      <div>
        <p className="text-body-sm text-fg-muted">{t("empty")}</p>
        {canManage ? <UploadForm locale={locale} proposalId={proposalId} /> : null}
      </div>
    );
  }

  return (
    <div>
      <p className="text-body-sm text-fg-muted">{t("count", { count: materials.length, value: formatNumber(materials.length, numerals) })}</p>
      <ul className="mt-4 flex flex-col gap-3">
        {materials.map((m) => (
          <li key={m.id} className="rounded-field border border-edge p-4">
            <p className="text-body font-medium text-fg-heading">
              <bdi>{m.title}</bdi>
            </p>
            <p className="text-body-sm text-fg-muted">{t(`kind.${m.kind}`)}</p>

            {m.fontSubstitutionWarning ? (
              <p className="mt-2 text-body-sm text-fg-heading">{t("substitutionWarning.body", { family: m.fontSubstitutionWarning })}</p>
            ) : null}

            {m.externalUrl ? (
              <a href={m.externalUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-body-sm text-fg-body hover:text-fg-heading">
                {t("openExternal")}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      {canManage ? <UploadForm locale={locale} proposalId={proposalId} /> : null}
    </div>
  );
}
