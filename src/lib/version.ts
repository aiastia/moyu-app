/** 章节内容版本：编辑器保存后 bump，阅读页回焦时对比决定是否静默刷新 */
const versions = new Map<string, number>();

export function chapterKey(projectId: number, chapterId: number) {
  return `${projectId}:${chapterId}`;
}

export function bumpChapterVersion(projectId: number, chapterId: number) {
  versions.set(chapterKey(projectId, chapterId), Date.now());
}

export function getChapterVersion(projectId: number, chapterId: number) {
  return versions.get(chapterKey(projectId, chapterId)) ?? 0;
}
