const $ = id => document.getElementById(id);
function downloadBytes(bytes, name) {
    const url = URL.createObjectURL(new Blob([bytes], {type: 'application/vnd.sqlite3'}));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const stamp = () => new Date().toISOString().slice(0,10);
async function updatePrevious() { $('previous').disabled = !(await WorkDB.exportPrevious()); }
WorkDB.init(message => { $('message').textContent = message; }).then(async () => {
    $('message').textContent = '準備完了'; $('export').disabled = false; $('restore').disabled = false;
    await updatePrevious();
    $('migrationBackup').disabled = !(await WorkDB.exportMigration());
}).catch(error => { $('message').textContent = 'SQLite準備失敗: ' + error.message; console.error(error); });
$('export').onclick = () => {
    try { downloadBytes(WorkDB.export(), 'worklog-' + stamp() + '.sqlite'); }
    catch (error) { $('message').textContent = error.message; }
};
$('previous').onclick = async () => {
    try { const bytes = await WorkDB.exportPrevious(); if (bytes) downloadBytes(bytes, 'worklog-before-restore-' + stamp() + '.sqlite'); }
    catch (error) { $('message').textContent = error.message; }
};
$('restore').onclick = async () => {
    const file = $('file').files[0];
    if (!file) { $('message').textContent = 'SQLiteファイルを選択してください。'; return; }
    if (!confirm('現在のデータを置き換えます。よろしいですか？')) return;
    $('restore').disabled = true; $('export').disabled = true; $('previous').disabled = true;
    $('message').textContent = '整合性を検証して復元中…';
    try {
        await WorkDB.restore(new Uint8Array(await file.arrayBuffer()));
        $('message').textContent = '復元しました。復元前のデータも1世代保持しています。';
        $('file').value = '';
    } catch (error) { $('message').textContent = '復元失敗: ' + error.message; }
    finally { $('restore').disabled = false; $('export').disabled = false; await updatePrevious().catch(console.error); }
};

$('migrationBackup').onclick = async () => {
    try { const bytes = await WorkDB.exportMigration(); if (bytes) downloadBytes(bytes, 'worklog-before-schema-v2-' + stamp() + '.sqlite'); }
    catch (error) { $('message').textContent = error.message; }
};
