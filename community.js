let communityProfile = readStore('mp_community_profile', {
  display_name: 'Pessoa da comunidade', avatar_emoji: '🌿', theme: 'sage'
});
let communityObjectUrl = null;
let communityPosts = [];
let communityOwnPostIds = new Set();
let communityReactionCounts = new Map();

const communityMoods = {
  '': 'Prefere não dizer', bem: 'Bem', 'mais-ou-menos': 'Mais ou menos',
  ansioso: 'Ansioso(a)', triste: 'Triste', cansado: 'Cansado(a)'
};
const communityTopics = {
  'dia-a-dia': 'Meu dia a dia', 'pequena-vitoria': 'Pequena vitória',
  'dia-dificil': 'Dia difícil', 'quero-desabafar': 'Quero desabafar', rotina: 'Rotina e autocuidado'
};

function renderFilteredCommunityFeed() {
  const topic = document.getElementById('communityFilterTopic').value;
  const mood = document.getElementById('communityFilterMood').value;
  const posts = communityPosts.filter(post => (!topic || post.topic === topic) && (!mood || post.mood === mood));
  renderCommunityFeed(posts);
}

function reactionButton(postId, reaction, label) {
  const value = communityReactionCounts.get(`${postId}:${reaction}`);
  return `<button type="button" data-react-post="${esc(postId)}" data-reaction="${reaction}" aria-pressed="${!!value?.reacted}">${label} <span>${value?.count || 0}</span></button>`;
}

function renderCommunityProfile() {
  document.getElementById('communityAlias').value = communityProfile.display_name || 'Pessoa da comunidade';
  document.getElementById('communityEmoji').value = communityProfile.avatar_emoji || '🌿';
  document.getElementById('communityTheme').value = communityProfile.theme || 'sage';
}

async function loadCommunityProfile() {
  if (!authClient || !currentUser) return;
  const { data, error } = await authClient.from('community_profiles')
    .select('display_name,avatar_emoji,theme').eq('user_id', currentUser.id).maybeSingle();
  if (error) {
    document.getElementById('communityProfileStatus').textContent = 'Não consegui carregar sua personalização agora.';
    return;
  }
  if (data) communityProfile = data;
  else await authClient.from('community_profiles').upsert({ user_id: currentUser.id, ...communityProfile });
  localStorage.setItem('mp_community_profile', JSON.stringify(communityProfile));
  renderCommunityProfile();
}

function renderCommunityFeed(posts) {
  const feed = document.getElementById('communityFeed');
  if (!posts.length) {
    feed.innerHTML = '<div class="empty">Ainda não há relatos publicados. Se quiser, você pode compartilhar o seu.</div>';
    return;
  }
  feed.innerHTML = posts.map(post => {
    const when = new Date(post.created_at).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
    const who = post.is_anonymous ? 'Anônimo' : esc(post.display_name || 'Pessoa da comunidade');
    const mood = communityMoods[post.mood] || '';
    return `<article class="community-post" data-post-id="${esc(post.id)}" data-theme="${esc(post.theme)}">
      <div class="community-post-head"><span class="community-post-avatar">${esc(post.avatar_emoji || '🌿')}</span><div><div class="community-post-name">${who}</div><div class="community-post-meta">${esc(when)}${post.city ? ' · ' + esc(post.city) : ''}</div></div>${post.status === 'pending' ? '<span class="community-pending">Aguardando revisão</span>' : ''}</div>
      <div class="community-post-body">${esc(post.body)}</div>
      <div class="community-post-tags"><span class="community-tag">${esc(communityTopics[post.topic] || communityTopics['dia-a-dia'])}</span>${mood ? `<span class="community-tag">${esc(mood)}</span>` : ''}${post.status === 'pending' ? '<span class="community-tag">Visível só para você até a aprovação</span>' : ''}</div>
      ${post.image_path ? '<div class="community-image-slot" aria-live="polite"></div>' : ''}
      ${post.status === 'published' || communityOwnPostIds.has(post.id) ? `<div class="community-post-actions">${post.status === 'published' ? `${reactionButton(post.id, 'with_you', '💛 Estou com você')}${reactionButton(post.id, 'thanks', '🌿 Obrigado por compartilhar')}${reactionButton(post.id, 'strength', '✨ Você é forte')}<button type="button" data-report-post="${esc(post.id)}">Denunciar</button>` : ''}${communityOwnPostIds.has(post.id) ? `<button type="button" data-delete-post="${esc(post.id)}">Apagar meu relato</button>` : ''}</div>` : ''}
    </article>`;
  }).join('');

  posts.filter(post => post.image_path).forEach(async post => {
    const card = feed.querySelector(`[data-post-id="${CSS.escape(post.id)}"] .community-image-slot`);
    if (!card) return;
    const { data, error } = await authClient.storage.from('community-photos').download(post.image_path);
    if (error || !data) {
      card.textContent = post.status === 'pending' ? 'A foto ficará disponível após a revisão.' : 'Não foi possível carregar esta foto.';
      return;
    }
    const imageUrl = URL.createObjectURL(data);
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = 'Foto compartilhada no relato';
    card.replaceChildren(image);
  });
}

async function loadCommunityFeed() {
  const feed = document.getElementById('communityFeed');
  if (!authClient) {
    feed.innerHTML = '<div class="empty">O mural online precisa da conexão com o Supabase.</div>';
    return;
  }
  feed.innerHTML = '<div class="empty">Carregando relatos...</div>';
  const { data, error } = await authClient.from('community_posts')
    .select('id,body,topic,city,mood,image_path,display_name,avatar_emoji,theme,is_anonymous,status,created_at')
    .in('status', currentUser ? ['published', 'pending'] : ['published'])
    .order('created_at', { ascending: false }).limit(24);
  if (error) {
    feed.innerHTML = '<div class="empty">Não consegui carregar o mural. Confira se as tabelas da comunidade foram configuradas.</div>';
    console.error('Mural da comunidade:', error.message);
    return;
  }
  communityPosts = data || [];
  communityOwnPostIds = new Set();
  communityReactionCounts = new Map();
  if (currentUser) {
    const { data: ownIds } = await authClient.rpc('my_community_post_ids');
    communityOwnPostIds = new Set((ownIds || []).map(row => typeof row === 'string' ? row : row.my_community_post_ids));
  }
  const publishedIds = communityPosts.filter(post => post.status === 'published').map(post => post.id);
  if (publishedIds.length) {
    const { data: counts } = await authClient.rpc('community_reaction_counts', { p_post_ids: publishedIds });
    (counts || []).forEach(row => communityReactionCounts.set(`${row.post_id}:${row.reaction}`, { count: Number(row.reaction_count), reacted: !!row.reacted }));
  }
  renderFilteredCommunityFeed();
}

document.getElementById('communityFilterTopic').addEventListener('change', renderFilteredCommunityFeed);
document.getElementById('communityFilterMood').addEventListener('change', renderFilteredCommunityFeed);

document.getElementById('communityProfileForm').addEventListener('submit', async event => {
  event.preventDefault();
  const status = document.getElementById('communityProfileStatus');
  communityProfile = {
    display_name: document.getElementById('communityAlias').value.trim().slice(0, 32),
    avatar_emoji: document.getElementById('communityEmoji').value,
    theme: document.getElementById('communityTheme').value
  };
  if (communityProfile.display_name.length < 2) {
    status.textContent = 'Escolha um apelido com pelo menos 2 caracteres.';
    return;
  }
  localStorage.setItem('mp_community_profile', JSON.stringify(communityProfile));
  if (!currentUser || !authClient) {
    status.textContent = 'Entre na sua conta para salvar sua personalização entre dispositivos.';
    setAuthMode('login'); authModal.classList.add('open');
    return;
  }
  const { error } = await authClient.from('community_profiles').upsert({ user_id: currentUser.id, ...communityProfile });
  status.textContent = error ? 'Não consegui salvar. Tente novamente.' : 'Sua página foi personalizada.';
});

document.getElementById('communityPhoto').addEventListener('change', event => {
  const file = event.target.files?.[0];
  const preview = document.getElementById('communityPhotoPreview');
  const photoConsent = document.getElementById('communityPhotoConsent');
  const photoConsentWrap = document.getElementById('communityPhotoConsentWrap');
  if (communityObjectUrl) URL.revokeObjectURL(communityObjectUrl);
  communityObjectUrl = null;
  preview.replaceChildren();
  preview.hidden = true;
  photoConsent.checked = false;
  photoConsent.required = !!file;
  photoConsentWrap.hidden = !file;
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) {
    event.target.value = '';
    photoConsent.checked = false; photoConsent.required = false; photoConsentWrap.hidden = true;
    document.getElementById('communityStatus').textContent = 'Escolha uma foto JPG, PNG ou WebP de até 4 MB.';
    return;
  }
  communityObjectUrl = URL.createObjectURL(file);
  const image = document.createElement('img'); image.src = communityObjectUrl; image.alt = 'Prévia da foto';
  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.className = 'community-photo-cancel'; cancel.textContent = '×';
  cancel.setAttribute('aria-label', 'Cancelar envio da foto');
  cancel.title = 'Remover foto';
  cancel.addEventListener('click', () => {
    event.target.value = '';
    if (communityObjectUrl) URL.revokeObjectURL(communityObjectUrl);
    communityObjectUrl = null;
    preview.replaceChildren();
    preview.hidden = true;
    photoConsent.checked = false; photoConsent.required = false; photoConsentWrap.hidden = true;
    document.getElementById('communityStatus').textContent = 'Foto removida. Ela não será enviada.';
  });
  preview.replaceChildren(image, cancel); preview.hidden = false;
});

document.getElementById('communityForm').addEventListener('submit', async event => {
  event.preventDefault();
  const status = document.getElementById('communityStatus');
  if (!currentUser || !authClient) {
    status.textContent = 'Entre ou crie uma conta para enviar um relato.';
    setAuthMode('login'); authModal.classList.add('open');
    return;
  }
  if (!document.getElementById('communityConsent').checked) {
    status.textContent = 'Marque a autorização antes de enviar.';
    return;
  }
  const body = document.getElementById('communityBody').value.trim();
  if (!body) return;
  const file = document.getElementById('communityPhoto').files?.[0];
  const submit = document.getElementById('communitySubmit');
  submit.disabled = true;
  status.textContent = 'Verificando o texto e a foto antes do envio...';
  try {
    let photoBase64 = null;
    if (file) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) {
        throw new Error('A foto precisa ser JPG, PNG ou WebP e ter até 4 MB.');
      }
      photoBase64 = (await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('Não consegui ler a foto. Tente escolher o arquivo novamente.'));
        reader.readAsDataURL(file);
      }));
    }
    const anonymous = document.getElementById('communityAnonymous').checked;
    const { data, error } = await authClient.functions.invoke('community-submit', {
      body: {
        body, topic: document.getElementById('communityTopic').value,
        city: document.getElementById('communityCity').value.trim(), mood: document.getElementById('communityMood').value,
        is_anonymous: anonymous, display_name: communityProfile.display_name,
        avatar_emoji: communityProfile.avatar_emoji, theme: communityProfile.theme,
        photo_base64: photoBase64, photo_type: file?.type || null,
        photo_no_minors_confirmed: !file || document.getElementById('communityPhotoConsent').checked
      }
    });
    if (error) throw error;
    if (data?.blocked) {
      status.textContent = data.error || 'O texto ou a foto pode não ser adequado. Revise o conteúdo ou remova a foto.';
      return;
    }
    if (!data?.ok) throw new Error(data?.error || 'Não consegui enviar agora.');
    event.target.reset();
    document.getElementById('communityAnonymous').checked = true;
    document.getElementById('communityPhotoPreview').hidden = true;
    document.getElementById('communityPhotoConsent').required = false;
    document.getElementById('communityPhotoConsent').checked = false;
    document.getElementById('communityPhotoConsentWrap').hidden = true;
    if (communityObjectUrl) URL.revokeObjectURL(communityObjectUrl);
    communityObjectUrl = null;
    status.textContent = 'Texto e foto passaram pela verificação automática. O relato está aguardando revisão humana.';
    await loadCommunityFeed();
  } catch (error) {
    status.textContent = error.context?.status === 503
      ? 'A verificação automática ainda não está pronta ou não respondeu. O relato não foi enviado. Confira a configuração.'
      : (error.message || 'Não consegui enviar agora. Confira sua conexão e tente novamente.');
    console.error('Envio para o mural:', error);
  } finally {
    submit.disabled = false;
  }
});

document.getElementById('communityRefresh').addEventListener('click', loadCommunityFeed);
document.getElementById('communityFeed').addEventListener('click', async event => {
  const report = event.target.closest('[data-report-post]');
  const react = event.target.closest('[data-react-post]');
  const deleteButton = event.target.closest('[data-delete-post]');
  if (!report && !react && !deleteButton) return;
  if (!currentUser || !authClient) {
    setAuthMode('login'); authModal.classList.add('open');
    document.getElementById('authMessage').textContent = 'Entre na sua conta para usar esta opção.';
    return;
  }
  const button = report || react || deleteButton;
  button.disabled = true;
  if (react) {
    const { error } = await authClient.rpc('toggle_community_reaction', { p_post_id: react.dataset.reactPost, p_reaction: react.dataset.reaction });
    if (error) { react.disabled = false; react.title = 'Não consegui salvar a reação. Tente novamente.'; return; }
    await loadCommunityFeed();
    return;
  }
  if (deleteButton) {
    const post = communityPosts.find(item => item.id === deleteButton.dataset.deletePost);
    if (!post || !communityOwnPostIds.has(post.id)) { deleteButton.disabled = false; return; }
    if (!await confirmAction('Este relato e a foto anexada serão apagados permanentemente.', 'Apagar meu relato?')) { deleteButton.disabled = false; return; }
    if (post.image_path) {
      const { error: photoError } = await authClient.storage.from('community-photos').remove([post.image_path]);
      if (photoError) { deleteButton.disabled = false; deleteButton.title = 'Não consegui apagar a foto. Tente novamente.'; return; }
    }
    const { error } = await authClient.from('community_posts').delete().eq('id', post.id);
    if (error) { deleteButton.disabled = false; deleteButton.title = 'Não consegui apagar. Tente novamente.'; return; }
    await loadCommunityFeed();
    return;
  }
  const { error } = await authClient.from('community_reports').insert({ post_id: report.dataset.reportPost, reason: 'Conteúdo inadequado' });
  report.textContent = error?.code === '23505' ? 'Já foi denunciada' : error ? 'Tente novamente' : 'Denúncia enviada';
});

if (authClient) authClient.auth.onAuthStateChange(() => {
  if (currentUser) void loadCommunityProfile();
  if (activePage === 'community') void loadCommunityFeed();
});
