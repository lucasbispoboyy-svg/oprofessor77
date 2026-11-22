'use strict';
// Checkout próprio de cada loja: para onde vai o cliente final ao clicar em "Comprar".
const cripto = require('./cripto');
const pix = require('./pix');

const GATEWAYS = {
  link: { nome: 'Link externo', desc: 'Yampi, CartPanda, Kiwify, Hotmart, Appmax, Shopify ou qualquer link de pagamento.' },
  mercadopago: { nome: 'Mercado Pago', desc: 'Pix, cartão e boleto. O dinheiro cai na sua conta do Mercado Pago.' },
  stripe: { nome: 'Stripe', desc: 'Cartão de crédito. O dinheiro cai na sua conta Stripe.' },
  pix: { nome: 'Pix direto', desc: 'QR Code e copia e cola na sua chave Pix, com o valor do produto.' },
  whatsapp: { nome: 'WhatsApp', desc: 'O cliente é levado para conversar com você e fechar a venda.' },
};

const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function iniciar(ck, idx, urlLoja) {
  urlLoja = String(urlLoja).replace(/\/$/, '');
  const prods = ck.produtos || [];
  const p = prods[idx] || prods[0] || null;
  const erroGateway = { erro: 'Não foi possível abrir o pagamento agora. Tente novamente em instantes.' };
  try {
    switch (ck.gateway) {
      case 'link': {
        const u = (p && p.link) || ck.link;
        return u ? { url: u } : { erro: 'Esta loja ainda não configurou o checkout.' };
      }
      case 'mercadopago': {
        const token = cripto.decifrar(ck.mp_token);
        if (!token || !p) return { erro: 'Esta loja ainda não configurou o checkout.' };
        const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ title: p.nome, quantity: 1, unit_price: p.valor_centavos / 100, currency_id: 'BRL' }],
            back_urls: { success: urlLoja, failure: urlLoja, pending: urlLoja },
            auto_return: 'approved',
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.init_point) {
          console.error('Mercado Pago:', r.status, j.message || '');
          return erroGateway;
        }
        return { url: j.init_point };
      }
      case 'stripe': {
        const chave = cripto.decifrar(ck.stripe_key);
        if (!chave || !p) return { erro: 'Esta loja ainda não configurou o checkout.' };
        const corpo = new URLSearchParams({
          mode: 'payment',
          'line_items[0][quantity]': '1',
          'line_items[0][price_data][currency]': 'brl',
          'line_items[0][price_data][unit_amount]': String(p.valor_centavos),
          'line_items[0][price_data][product_data][name]': p.nome,
          success_url: urlLoja + '/?pago=1',
          cancel_url: urlLoja + '/',
        });
        const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + chave, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: corpo,
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.url) {
          console.error('Stripe:', r.status, (j.error && j.error.message) || '');
          return erroGateway;
        }
        return { url: j.url };
      }
      case 'pix': {
        if (!ck.pix_chave) return { erro: 'Esta loja ainda não configurou o checkout.' };
        return {
          pix: {
            payload: pix.payload({ chave: ck.pix_chave, nome: ck.pix_nome, cidade: ck.pix_cidade, valor: p ? p.valor_centavos / 100 : null }),
            valor: p ? p.valor_centavos : null,
            produto: p ? p.nome : '',
            recebedor: ck.pix_nome || '',
            whats: ck.whats_numero || '',
          },
        };
      }
      case 'whatsapp': {
        if (!ck.whats_numero) return { erro: 'Esta loja ainda não configurou o checkout.' };
        const msg = String(ck.whats_msg || 'Olá! Quero comprar {produto} ({valor}).')
          .replace(/\{produto\}/g, p ? p.nome : '')
          .replace(/\{valor\}/g, p ? brl(p.valor_centavos) : '');
        return { url: `https://wa.me/${ck.whats_numero}?text=${encodeURIComponent(msg)}` };
      }
      default:
        return { erro: 'Esta loja ainda não configurou o checkout.' };
    }
  } catch (e) {
    console.error('Checkout:', e.message);
    return erroGateway;
  }
}

function mascarar(cifrado) {
  const s = cripto.decifrar(cifrado);
  return s ? s.slice(0, 8) + '…' + s.slice(-4) : '';
}

module.exports = { GATEWAYS, iniciar, mascarar };
