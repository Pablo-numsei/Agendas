const reviewPanel = document.getElementById('communityReview');
const reviewFeed = document.getElementById('communityReviewFeed');
const reviewStatus = document.getElementById('communityReviewStatus');

function renderCommunityReview(posts) {
  if (!posts.length) {
    reviewFeed.innerHTML = '<div class="empty">Nenhum relato aguardando revisão.</div>';
    return;
  }
  reviewFeed.innerHTML = posts.map(post => `<article class="community-review-card" data-review-id="${esc(post.id)}">
    <div class="community-review-meta">${esc(new Date(post.created_at).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }))} · ${esc(post.topic || 'Relato')} · ${esc(post.mood || 'Sem sentimento informado')}${post.city ? ' · ' + esc(post.city) : ''}</div>
    <div class="community-post-body">${esc(post.body)}</div>
    ${post.image_url ? `<img src="${esc(post.image_url)}" alt="Foto anexada ao relato">` : '<div class="community-review-meta">Este relato não tem foto.</div>'}
    <div class="community-review-actions"><button class="community-review-approve" type="button" data-review-action="published">Aprovar e publicar</button><button class="community-review-remove" type="button" data-review-action="removed">Remover relato</button></div>
  </article>`).join('');
}

async function loadCommunityReview() {
  if (!reviewPanel || !authClient || !currentUser) { if (reviewPanel) reviewPanel.hidden = true; return; }
  reviewStatus.textContent = 'Verificando acesso à revisão…';
  const { data, error } = await authClient.functions.invoke('community-review', { body: { action: 'list' } });
  if (error || !data?.ok) {
    reviewPanel.hidden = true;
    if (data?.not_moderator) return;
    console.error('Fila de revisão:', error || data?.error);
    return;
  }
  reviewPanel.hidden = false;
  reviewStatus.textContent = `${data.posts.length} relato${data.posts.length === 1 ? '' : 's'} aguardando revisão. O conteúdo e as fotos só ficam visíveis para a conta de moderação.`;
  renderCommunityReview(data.posts);
}

document.getElementById('communityReviewRefresh')?.addEventListener('click', () => void loadCommunityReview());
reviewFeed?.addEventListener('click', async event => {
  const button = event.target.closest('[data-review-action]');
  if (!button || !currentUser || !authClient) return;
  const card = button.closest('[data-review-id]');
  const action = button.dataset.reviewAction;
  if (action === 'published' && !await confirmAction('Este relato ficará visível para as pessoas no mural. Confira o texto e a foto antes de publicar.', 'Aprovar e publicar?', 'Aprovar e publicar')) return;
  if (action === 'removed' && !await confirmAction('Este relato será removido da fila e não aparecerá no mural.', 'Remover relato?', 'Remover relato')) return;
  button.disabled = true;
  reviewStatus.textContent = 'Salvando decisão…';
  const { data, error } = await authClient.functions.invoke('community-review', { body: { action, post_id: card.dataset.reviewId } });
  if (error || !data?.ok) {
    button.disabled = false;
    reviewStatus.textContent = data?.error || 'Não consegui salvar. Tente novamente.';
    return;
  }
  reviewStatus.textContent = action === 'published' ? 'Relato publicado.' : 'Relato removido da fila.';
  await Promise.all([loadCommunityReview(), loadCommunityFeed()]);
});

document.addEventListener('click', event => {
  if (event.target.closest('[data-page="community"]')) setTimeout(() => void loadCommunityReview(), 0);
});
if (authClient) authClient.auth.onAuthStateChange(() => setTimeout(() => void loadCommunityReview(), 0));
if (activePage === 'community') void loadCommunityReview();
