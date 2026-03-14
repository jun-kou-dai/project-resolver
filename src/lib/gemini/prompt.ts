import type { ExtractedUrlInfo } from '../types';

export function buildPrompt(
  extractedInfos: ExtractedUrlInfo[],
  folderInfo?: string
): string {
  const urlDescriptions = extractedInfos.map((info, i) => {
    const parts = [`URL ${i + 1}: ${info.url}`];
    parts.push(`  タイプ: ${info.type}`);
    if (info.title) parts.push(`  タイトル: ${info.title}`);
    if (info.description) parts.push(`  説明: ${info.description}`);
    if (info.repoName) parts.push(`  リポジトリ名: ${info.repoName}`);
    if (info.repoDescription) parts.push(`  リポジトリ説明: ${info.repoDescription}`);
    if (info.topics?.length) parts.push(`  トピック: ${info.topics.join(', ')}`);
    if (info.homepageUrl) parts.push(`  ホームページURL: ${info.homepageUrl}`);
    if (info.language) parts.push(`  言語: ${info.language}`);
    if (info.headings?.length) parts.push(`  見出し: ${info.headings.slice(0, 5).join(' | ')}`);
    if (info.readmeSnippet) parts.push(`  README抜粋:\n${info.readmeSnippet.slice(0, 500)}`);
    if (info.contentSnippet) parts.push(`  コンテンツ抜粋: ${info.contentSnippet.slice(0, 300)}`);
    return parts.join('\n');
  }).join('\n\n');

  const folderSection = folderInfo
    ? `\n\n## ローカルフォルダ情報（最重要）
ユーザーのローカルマシンにあるフォルダ一覧です（~/Desktop/, ~/code/ など複数ディレクトリ）。
各プロジェクトに該当するフォルダを **必ず** マッチングしてください。

マッチングルール:
- フォルダ名とプロジェクト名・リポジトリ名・URL slug が部分一致すれば該当とみなす
- 例: ~/Desktop/nano-storybook → nano-storybook.netlify.app は同一
- 例: ~/Desktop/onsei → github.com/xxx/onsei は同一
- 例: ~/code/260220kids → 子供向けアプリのプロジェクトに該当
- マッチしたら localFolder にフルパス（例: "~/Desktop/nano-storybook" や "~/code/260220kids"）を設定すること
- マッチするフォルダがない場合のみ null にすること

${folderInfo}`
    : '';

  return `あなたはプロジェクト整理の専門家です。
以下のURL一覧を分析し、同じプロジェクト（案件）に属するURLをグループ化してください。

## 最重要ルール
- 「候補を並べる」のではなく、「案件ごとに束ねる」ことを優先してください
- ただし、根拠が弱いのに無理に断定統合しないこと
- できるだけ当てにいくが、根拠なしの断定は禁止

## 判定基準（優先度順）
1. GitHubリポジトリのhomepage URLがデプロイ先URLと一致するか（最強の根拠）
2. README内容と公開サイトの説明文が同じ機能・サービスを説明しているか
3. リポジトリ名とサイト名・ドメイン名の類似性
4. 機能説明・サービス説明の一致
5. 使用技術の一致
6. ブランド名・プロダクト名の一致
7. URLのslug・パスの類似性

## 重要な注意
- タイトル一致だけに頼らない。説明文・機能文言・README内容を重視すること
- 名前がズレていても、説明している内容が同じなら同一案件候補として強く扱う
- 1つのURLは1つの案件にのみ属する
- グループ化できないURLはungroupedに入れる
- 確信度は正直につける: high=確定（根拠十分）, medium=有力候補, low=保留

## 状態推定の基準
- active: 本番URLが存在しアクセスできる
- developing: GitHubにコードがあるがデプロイ先が見つからない
- prototype: 試作段階と思われる
- stopped: サイトが停止・エラー
- unknown: 判断材料不足

## URL一覧
${urlDescriptions}
${folderSection}

上記のURLを分析し、案件ごとにグループ化してください。

## 出力JSON形式（厳守）
以下の形式のJSONで返してください。他の形式は不可。
{
  "projects": [
    {
      "projectName": "案件名",
      "description": "案件の簡単な説明",
      "urls": [
        { "url": "https://...", "role": "ソースコード" }
      ],
      "reasoning": "この案件にまとめた根拠を具体的に書く",
      "confidence": "high または medium または low",
      "status": "active または developing または prototype または stopped または unknown",
      "techStack": ["React", "TypeScript"],
      "localFolder": "~/Desktop/project-name（ローカルフォルダ情報から推定。不明ならnull）"
    }
  ],
  "ungrouped": [
    { "url": "https://...", "reason": "グループ化できなかった理由" }
  ],
  "summary": "全体のまとめ（例: 3件のURLから2つのプロジェクトを検出しました）"
}`;
}
