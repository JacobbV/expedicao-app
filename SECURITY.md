# Política de segurança

## Versões com suporte

O Expedição está em desenvolvimento. Só a versão publicada mais recente, em https://jacobbv.github.io/expedicao-app/, recebe correções de segurança.

| Versão | Suporte |
|---|---|
| Mais recente (branch `main`) | ✅ |
| Anteriores | ❌ |

## Como relatar uma vulnerabilidade

Se você encontrou uma falha de segurança, como acesso aos dados de uma viagem de que você não participa, **não abra uma issue pública**.

Use o relato privado do GitHub: aba **Security** → **Report a vulnerability**.

Inclua, se puder:
- o que você encontrou e onde (tela, arquivo ou regra);
- os passos para reproduzir;
- o impacto que você imagina.

## O que esperar

- Resposta inicial em até 7 dias.
- Se a falha for confirmada, a correção sai numa nova versão e o histórico do README registra a mudança, sem expor detalhes que ajudem a explorar a falha antes da correção.
- Quem relatar pode ser creditado, se quiser.

## Observação sobre a configuração do Firebase

O arquivo `firebase-config.js` traz a chave pública do projeto. Isso é esperado num app web do Firebase e não é uma vulnerabilidade: o acesso aos dados é controlado pelas regras do Firestore (`firestore.rules`) e pelo login.
