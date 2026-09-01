export type PipelineArchiveApproval = {
  kind: "pipeline_archive";
  confirmationToken: string;
  pipelineRef: string;
};

/** Bind an owner click to one exact server-issued archive preview. */
export function hasExactPipelineArchiveApproval(
  approvals: PipelineArchiveApproval[] | undefined,
  confirmationToken: string,
  pipelineRef: string,
): boolean {
  return approvals?.some((approval) =>
    approval.kind === "pipeline_archive"
    && approval.confirmationToken === confirmationToken
    && approval.pipelineRef === pipelineRef
  ) === true;
}
