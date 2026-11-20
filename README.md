# 🏍️ Expedição

**Companheiro de viagem para expedições de moto.** Monte o roteiro, saiba onde abastecer pela autonomia da sua moto, divida os gastos com quem vai junto, acompanhe o tempo no caminho e leve o roadbook na palma da mão, com ou sem sinal.

> Nome provisório. Evolução do app [Expedição Chapada](https://github.com/JacobbV/expedicao-chapada), que continua separado, só para a viagem do Jacó e do Kaique.

**Status:** em construção · **Versão atual:** 2.0.3 ([histórico](#histórico-de-versões))

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
| **2.0.3** | 20/11/2026 | Nova navegação: menu lateral que recolhe no computador (com a lista das suas viagens), sem barra embaixo no computador; foto ou iniciais no canto abrindo o menu da conta (perfil e moto, tema, estilo, compartilhar, sobre e créditos, sair); tema **claro, escuro ou do aparelho** para Placa e Trilha; telas próprias de “Estilo e ajustes” e “Sobre e créditos”; marca do app (placa com seta) |
| 2.0.2 | 20/11/2026 | Atualização mais confiável: o app sempre confere no servidor se há arquivo novo, para não abrir com parte da versão nova e parte da antiga |
| 2.0.1 | 20/11/2026 | Tela larga (computador e tablet deitado): menu na lateral com “Desenvolvido por QYUDEV.”, viagens em grade, página da viagem, Perfil e Ajustes em duas colunas e entrada com apresentação ao lado do formulário. No celular nada muda. Links do estilo Asfalto na cor certa |
| 2.0.0-a | 20/11/2026 | Primeira versão do app: cadastro e login (e-mail e senha ou Google, com “Esqueci minha senha”), **Minhas viagens**, **+ Nova viagem** (nome, quem vai, saída, destino, datas e a sua moto), página da viagem com contagem regressiva e pilotos, Perfil (moto, consumo e tanque; sair; excluir conta), Ajustes com os 3 estilos (**Placa**, Asfalto e Trilha) e créditos. Funciona offline |
| 0.1.1 | 13/11/2026 | Configuração do projeto Firebase `expedicao-app-3041f` em `firebase-config.js` |
| 0.1.0 | 06/11/2026 | Repositório criado: página “em construção”, regras do Firestore para várias viagens com convite por link, modelo do `firebase-config.js` e plano das versões |

## Créditos

| O quê | Para quê | Licença |
|---|---|---|
| [Firebase](https://firebase.google.com) | login e sincronização | serviço do Google |
| [GitHub Pages](https://pages.github.com) | hospedagem | serviço do GitHub |
| [Overpass](https://fonts.google.com/specimen/Overpass) (Delve Withrington) | fonte principal | SIL OFL 1.1 |
| [Overpass Mono](https://fonts.google.com/specimen/Overpass+Mono) | números | SIL OFL 1.1 |
| [Fraunces](https://fonts.google.com/specimen/Fraunces) (Undercase Type) | títulos do estilo Trilha | SIL OFL 1.1 |
| [Google Fonts](https://fonts.google.com) | entrega das fontes | serviço do Google |

Mapa, rotas e tempo (OpenStreetMap, Leaflet, OSRM, Nominatim, Open-Meteo) entram nos créditos quando chegarem ao app, na 2.0-c.

## Autor

Desenvolvido por **[QYUDEV.](https://jacobbv.github.io/)** · Jacó · © 2026
