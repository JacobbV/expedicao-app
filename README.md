# 🏍️ Expedição

**Companheiro de viagem para expedições de moto.** Monte o roteiro, saiba onde abastecer pela autonomia da sua moto, divida os gastos com quem vai junto, acompanhe o tempo no caminho e leve o roadbook na palma da mão, com ou sem sinal.

> Nome provisório. Evolução do app [Expedição Chapada](https://github.com/JacobbV/expedicao-chapada), que continua separado, só para a viagem do Jacó e do Kaique.

**Status:** em construção · **Versão atual:** 0.1.0 ([histórico](#histórico-de-versões))

## O que o app vai ter

| Versão | O que entra |
|---|---|
| **2.0** | Cadastro e login (e-mail e Google), **Minhas viagens**, **+ Nova viagem** (nome, tipo, datas, saída, motos), **convite por link** com dono e pilotos, e tudo o que o app da Chapada já faz, por viagem: roteiro, mapa, tempo, abastecimento, gastos, checklist, diário de bordo, segurança, fotos e roadbook |
| **2.1** | **Planejador:** saída, destino, por onde passar e km por dia; o app divide em dias, sugere os pernoites (com as cidades antes e depois para trocar) e os postos no caminho |
| **2.2** | **Importar rota:** colar link do Google Maps ou arquivo GPX |
| **2.3** | Moeda e país por viagem |
| **2.4** | Modelos de expedição prontos e hotéis/pousadas no caminho (OpenStreetMap) |
| Depois | Play Store e App Store, nome e marca final |

## Tecnologia

App web instalável (PWA), em JavaScript sem build, hospedado no GitHub Pages, com login e sincronização pelo Firebase (Authentication + Firestore). Funciona offline e sincroniza quando a internet volta.

## Configuração

1. **Firebase:** crie o projeto, o Firestore (`southamerica-east1`) e ligue Authentication com **E-mail/senha** e **Google**.
2. **Regras:** copie [`firestore.rules`](firestore.rules) inteiro para **Firestore → Regras** e publique. Este arquivo não tem e-mails: cada viagem guarda os próprios membros.
3. **Configuração do app:** cole o `firebaseConfig` em [`firebase-config.js`](firebase-config.js).
4. **Domínio:** em Authentication → Configurações → Domínios autorizados, acrescente `jacobbv.github.io`.

## Estrutura dos dados

```
users/{uid}                      perfil da conta
trips/{id}                       viagem: nome, datas, dias, owner, memberIds, members, invite
trips/{id}/riders/{uid}          piloto e moto na viagem
trips/{id}/checklist/{uid}       checklist de cada um
trips/{id}/expenses/{id}         gastos da viagem
trips/{id}/points|lodging|meta   mapa, hospedagem, pendências e avisos
trips/{id}/photos|photofull      fotos por dia
trips/{id}/private/{uid}/prep    meus gastos (só a própria conta)
```

## Histórico de versões

| Versão | Data | O que mudou |
|---|---|---|
| **0.1.0** | 06/11/2026 | Repositório criado: página “em construção”, regras do Firestore para várias viagens com convite por link, modelo do `firebase-config.js` e plano das versões |

## Créditos

A lista completa de serviços e bibliotecas, com fonte e licença, entra junto com o app na versão 2.0 (OpenStreetMap, Leaflet, OSRM, Nominatim, Open-Meteo, Firebase, GitHub Pages, Google Fonts).

## Autor

Feito por **Jacó** · [QyuDev](https://github.com/JacobbV) · © 2026
