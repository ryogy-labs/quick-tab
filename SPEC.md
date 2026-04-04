# Quick TAB

## Overview
ブラウザ上でギター TAB 譜を高速入力するための単一ページエディタ。譜面プレビュー、TAB グリッド、フレットボード入力、モバイル用テンキーを組み合わせ、短い操作で音価付きのノートや休符を配置できることを目的とする。

## Stack
- Framework: Next.js App Router + React + TypeScript
- Rendering: クライアントコンポーネント主体。譜面プレビューは独自 SVG 描画、音のプレビューは Web Audio で生成する
- Storage: 保存先はブラウザ `localStorage`。サーバー保存や同期機構は持たない

## Structure
- `app/page.tsx`: エディタ本体。選択状態、入力、再生、measure 操作、クリップボード、永続化、キーボードショートカットを統合管理する
- `app/tabModel.ts`: TAB データモデルと編集ルール。イベント衝突判定、sanitize、measure 操作、コピー/ペースト変換、legacy 互換を担う
- `app/components/StaffPreview.tsx`: TAB データから五線譜プレビューを描画する
- `app/components/FretboardInput.tsx`: フレットボード UI とフリック入力を扱う
- `app/components/MobileNumpad.tsx`: モバイル向け数字入力と休符入力を扱う
- `app/hooks/useFlickGesture.ts`: フリック方向から音価と modifier を確定する
- `app/hooks/usePlayback.ts`: Web Audio による発音と step 単位の再生カーソル進行を管理する
- `app/hooks/useTabStorage.ts`: localStorage への読み書きと legacy データ移行を担う
- `app/hooks/useUndoRedo.ts`: undo/redo スタック管理と canUndo/canRedo 状態を担う
- `app/hooks/useKeyboardShortcuts.ts`: キーボードショートカットのイベント登録を担う

## Core Flows
- エディタは 4/4・96 step 単位の内部グリッドで動作し、表示上は 16 分音符単位の列を維持する
- 音価を先に選び、その後セルまたはフレットボード上の位置を指定してフレット番号を入力する。選択中イベントがある場合は、そのイベント長をツールバーへ同期する
- デスクトップでは数字キー、モバイルではテンキーからフレット番号を入力する。2 桁入力は短いバッファ時間内で結合され、確定後にノートを配置する
- フレットボードではタップで既定音価のノートを置き、フリックで音価と dotted/triplet modifier を含めて 1 アクションで配置できる
- 休符モードでは現在選択 step に休符を配置する。フリック休符入力でも同様に音価と modifier を反映する
- ノートまたは休符を配置した後、カーソルは入力長に応じて次の配置位置へ進む。最後の measure 末尾で編集している場合のみ、新しい measure を自動追加できる
- 既存イベントの持続中 step は新規開始位置としてブロックされる。選択がその範囲に入った場合はイベント開始 step へスナップする
- 入力モードは `Grid` と `Sequential` を持つ。`Grid` は既存イベントを動かさず、`Sequential` は既存イベントの音価変更時に後続イベントを左右へシフトする
- Measure 操作として前後移動、追加、挿入、削除、複製、measure 単位コピー/貼り付けを提供する。再生中は破壊的な編集を禁止する
- 範囲選択はドラッグで行うが、MVP では単一 measure 内にクランプされる。選択範囲は range copy/paste と範囲削除に使う
- Undo/Redo はローカル履歴で管理し、キーボードショートカットにも対応する
- Play を押すと現在 measure から step 単位で再生カーソルが進み、各 step 開始位置のイベントだけを発音する。overflow measure では remainder をスキップして次 measure へ進む。最後の measure まで到達すると停止し、選択は先頭へ戻る
- Export は現在の TAB データを JSON としてダウンロードし、Import は JSON を normalize/sanitize して現在のエディタ状態へ読み込む
- 譜面エリアとフレットボードはピンチまたはスライダーで拡大縮小できる。モバイル時は初期スケールを小さめに補正する

## Data Model
- 永続化される主データは `localStorage` の `quick-tab:mvp:v3` に保存する
- 旧データ `quick-tab:mvp:v2`, `quick-tab:mvp:v1` が存在する場合は、初回読込時に v3 モデルへ normalize して取り込む
- TAB データの基本構造は `TabDataV3 = { version, tempo, timeSig, stepsPerMeasure, tuning, measures }`
- `measures` は `[{ events: TabEvent[] }]` の配列で、各 `TabEvent` は note event または rest event を表す
- Note event は `step`, `len`, `notes`, optional `dot` / `triplet` を持ち、`notes` は `{ string, fret, technique? }[]` の配列で複数弦同時入力を表現する。`technique` は `"slide" | "hammer" | "pulloff" | "bend" | "vibrato"` のいずれかで、未設定の場合は通常奏法を意味する
- Rest event は `step`, `len`, `rest: true`, optional `dot` / `triplet` を持つ
- `stepsPerMeasure` は 96 を基本とし、16 分音符 = 6 step として表現する。これにより dotted / triplet を整数 step で扱う
- Measure clipboard と range clipboard はメモリ上の一時状態であり、リロード後には残らない
- 選択セル、選択範囲、再生状態、再生カーソル、undo/redo 履歴、数字入力バッファ、ズーム率、モバイル判定は UI 状態であり永続化しない
- Import 時や保存復元時は `normalizeToTabDataV3` と `sanitizeTabDataV3` を通し、不正値や競合イベントを補正した上で扱う
- Sequential モードで発生した overflow event は、`allowOverflow=true` の sanitize 経路で保持する
- `getEventOccupiedSteps(event)` は dot/triplet を考慮した実効占有ステップ数を返す。`getMeasureOccupiedSteps` はその合計、`isMeasureOverflowing` は合計が `stepsPerMeasure` を超えるかを返す
- `shiftEventsFromStep(events, fromStep, deltaSteps)` は `fromStep` 以降の全イベントを `deltaSteps` だけずらす。step < 0 になるイベントは削除し、`stepsPerMeasure` 超えはオーバーフローとして保持する
- Sequential モードのシフトは `getSequentialPlacementContext` / `applySequentialShift` / `applySequentialDeleteShift` の3関数に分離して `tabModel.ts` で管理する。ノート削除時も後続を左詰めする。各関数は `autoShift: boolean` を引数に取り、page.tsx 側で渡す

## Rules
- パラメータ範囲・初期値はコード上の定数を正とする。`SPEC.md` には重複記載しない
- 再生中は編集系操作を抑止する前提で扱う。入力 UI と measure 操作に同じ前提を保つ
- イベント配置ルール、競合解決、sanitize、legacy 互換は `app/tabModel.ts` を正とする
- 範囲選択は MVP では単一 measure に限定される。この制約を跨ぐ機能追加時は clipboard 仕様ごと見直す
- 大きな機能追加時も、まずは `page.tsx` と `tabModel.ts` の責務境界を崩さずに収めることを優先する
- `×` ボタンは event 単位削除、キーボード `Backspace/Delete` は選択弦の note 単位削除を基本とする
- Sequential シフトは「既存イベントの音価変更時」および「イベント削除時」に適用し、空ステップへの新規入力時には適用しない


## Known Issues
- `app/page.tsx` に UI 状態、再生、永続化、ショートカット、clipboard 処理が集中しており変更影響範囲が広い
- 範囲選択は単一 measure に制限されており、複数 measure に跨る編集はまだ扱えない
- 保存先が `localStorage` のみのため、端末変更やブラウザデータ削除では消える
- 再生は step ベースの簡易プレイヤーで、細かなタイミング表現や高度な発音制御は行っていない
- overflow event は内部保持（`allowOverflow=true` sanitize）・表示警告（赤バーライン）・再生スキップまで対応済み
- 「overflow 分だけ measure 幅を伸ばして完全に編集可能にする」仕様は未実装。TAB / 五線譜 / カーソル（selectedStep > 95）/ 自動スクロール / range selection の範囲拡張を含む再設計が必要
- 現在の措置は横スクロール1行レイアウト前提。将来の折り返し複数行レイアウト対応時は measure ごとの `displayColumns` 計算を導入する予定
