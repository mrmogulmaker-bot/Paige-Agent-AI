export type PipelineArchiveApproval = {
  kind: "pipeline_archive";
  confirmationToken: string;
  pipelineRef: string;
};

export type PipelineFolderArchiveApproval = {
  kind: "pipeline_folder_archive";
  confirmationToken: string;
  folderId: string;
  folderName: string;
};

export type ExactPipelineArchiveApproval = PipelineArchiveApproval | PipelineFolderArchiveApproval;

/** Bind an owner click to one exact server-issued archive preview. */
export function hasExactPipelineArchiveApproval(
  approvals: ExactPipelineArchiveApproval[] | undefined,
  confirmationToken: string,
  pipelineRef: string,
): boolean {
  return approvals?.some((approval) =>
    approval.kind === "pipeline_archive"
    && approval.confirmationToken === confirmationToken
    && approval.pipelineRef === pipelineRef
  ) === true;
}

/** Bind an owner click to one exact server-issued folder archive preview. */
export function hasExactPipelineFolderArchiveApproval(
  approvals: ExactPipelineArchiveApproval[] | undefined,
  confirmationToken: string,
  folderId: string,
  folderName: string,
): boolean {
  return approvals?.some((approval) =>
    approval.kind === "pipeline_folder_archive"
    && approval.confirmationToken === confirmationToken
    && approval.folderId === folderId
    && approval.folderName === folderName
  ) === true;
}
