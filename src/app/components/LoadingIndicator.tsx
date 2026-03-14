export function LoadingIndicator() {
  return (
    <div className="mt-8 text-center">
      <div className="inline-flex items-center gap-3 px-6 py-4 bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <div className="text-sm text-gray-600 text-left">
          <p className="font-medium">URL情報を取得してAIで解析中...</p>
          <p className="text-xs text-gray-400 mt-0.5">数秒〜数十秒かかることがあります</p>
        </div>
      </div>
    </div>
  );
}
