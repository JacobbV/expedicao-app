# 🏍️ Expedição

**Companheiro de viagem para expedições de moto.** Monte o roteiro, saiba onde abastecer pela autonomia da sua moto, divida os gastos com quem vai junto, acompanhe o tempo no caminho e leve o roadbook na palma da mão, com ou sem sinal.

> Nome provisório. Evolução do app [Expedição Chapada](https://github.com/JacobbV/expedicao-chapada), que continua separado, só para a viagem do Jacó e do Kaique.

**Status:** em construção · **Versão atual:** 3.1.0 ([histórico](#histórico-de-versões))

## O que o app vai ter

| Versão | O que entra |
|---|---|
| **2.0** ✅ | Cadastro e login, Minhas viagens, Nova viagem, convite por link, pilotos, foto do perfil, menu lateral, tema escuro, ícone e logo |
| **3.0** ✅ | Roteiro por dias, mapa e tempo · abastecimento, checklist e gastos · diário de bordo, segurança, modo pilotando, hospedagem, pendências, revisão e fotos · roadbook e resumo |
| **4.0** | **Planejador:** saída, destino, por onde passar e km por dia; o app divide em dias, sugere pernoites e postos; importar link do Google Maps ou GPX |
| A escolher | Viagem internacional (moeda, país, fronteira, altitude, o que vestir) e avisos no caminho · comunidade (modelos “Jacó fez assim”, marcos de motociclista) · lojas (domínio próprio, termos, notificações, Play Store e App Store) |

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
invites/{codigo}                 convite: viagem, dono, nome e datas (abre só pelo código)
trips/{id}                       viagem: nome, datas, dias, owner, memberIds, members, invite
trips/{id}/riders/{uid}          piloto e moto na viagem
trips/{id}/checklist/{uid}       checklist de cada um
trips/{id}/expenses/{id}         gastos da viagem
trips/{id}/points|lodging|meta   mapa, hospedagem, pendências e avisos
trips/{id}/photos|photofull      fotos por dia
trips/{id}/log/{id}              diário de bordo (cada um escreve o seu)
trips/{id}/private/{uid}/prep    meus gastos (só a própria conta)
```

## Histórico de versões

| Versão | Data | O que mudou |
|---|---|---|
| **3.1.0** | 21/11/2026 | Tipo de dia **Estrada + passeio**; passeio com saída, caminho, km, link, trilha, terra e **cor por circuito**; caminho separado por “·” e com pontos que não são cidade (Nominatim); aviso de lugar não achado; roteiro em **lista** ou detalhado; postos buscados por trechos com servidor reserva e aviso claro quando a busca falha; **🔒 Meus gastos** (preparação privada em `private/{uid}/prep`, “exibir para o grupo”) e **importar planilha** da Expedição Chapada |
| 3.0.0 | 20/11/2026 | **Roteiro por dias** (estrada, passeio, descanso; km e horas pela estrada; aviso de dia longo com opção de dividir; chegada depois do pôr do sol; Google Maps e Waze) · **Mapa** com a rota em vermelho, 3 estilos e pontos marcados · **Tempo** do dia, hora a hora e no caminho, e clima típico · **Abastecimento** pela autonomia de cada moto, com postos do OpenStreetMap · **Checklist** com lista pronta · **Gastos** divididos com acerto de contas e planilha · **Diário de bordo** com consumo real · **Segurança** (ficha, cheguei bem, localização) · **Modo pilotando** · **Hospedagem** · **Pendências** · **Revisão das motos** · **Fotos** por dia · **Roadbook** para imprimir (A4 ou 10×15) · **Resumo** · **Novidades** (sino) · logo nova na entrada e no Sobre, kit da marca em `marca/` |
| 2.0.5 | 20/11/2026 | Ícone novo do app (placa verde com seta) na aba do navegador, na tela inicial do celular e na instalação; imagem de pré-visualização para o link no WhatsApp e nas redes; “Compartilhar o app” com WhatsApp, copiar link e compartilhar; “Convidar para esta viagem” no menu da conta |
| 2.0.4 | 20/11/2026 | **Convite por link:** WhatsApp, copiar ou compartilhar; quem abre vê a viagem e quem convidou, informa a moto e entra (se ainda não tiver conta, cria e o convite abre em seguida). Dono troca o link e remove pilotos; piloto edita a própria moto e pode sair da viagem. **Foto do perfil** (guardada pequena, aparece para os outros pilotos). Regras do Firestore atualizadas (`invites` e novas permissões de piloto) |
| 2.0.3 | 20/11/2026 | Nova navegação: menu lateral que recolhe no computador (com a lista das suas viagens), sem barra embaixo no computador; foto ou iniciais no canto abrindo o menu da conta (perfil e moto, tema, estilo, compartilhar, sobre e créditos, sair); tema **claro, escuro ou do aparelho** para Placa e Trilha; telas próprias de “Estilo e ajustes” e “Sobre e créditos”; marca do app (placa com seta) |
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
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | mapa, postos e nomes de lugares · © colaboradores do OpenStreetMap | ODbL 1.0 |
| [OpenTopoMap](https://opentopomap.org) | estilo Relevo do mapa | CC BY-SA 3.0 |
| [Leaflet](https://leafletjs.com) | mapa interativo (via unpkg) | BSD-2-Clause |
| [OSRM](https://project-osrm.org) | rota pela estrada e km de cada dia (servidor público de demonstração) | BSD-2-Clause · dados ODbL |
| [Overpass API](https://overpass-api.de) e [overpass.kumi.systems](https://overpass.kumi.systems) (reserva) | postos de combustível perto da estrada | dados ODbL |
| [Nominatim](https://nominatim.org) | nome da cidade pela posição e pontos que não são cidade (cachoeira, mirante) | dados ODbL |
| [Open-Meteo](https://open-meteo.com) | previsão, clima típico e busca de cidades | CC BY 4.0 · grátis só para uso não comercial |
| [GeoNames](https://www.geonames.org) | base das cidades usada pelo Open-Meteo | CC BY 4.0 |

> **Antes de cobrar pelo app:** o Open-Meteo grátis é só para uso não comercial, e os servidores públicos do OSRM, Overpass e Nominatim têm limite de uso. Na fase das lojas, trocar por plano pago ou servidor próprio.

## Autor

Desenvolvido por **[QYUDEV.](https://jacobbv.github.io/)** · Jacó · © 2026
