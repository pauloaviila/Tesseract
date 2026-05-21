UI/UX BLUEPRINT: PROJECT TESSERACT (2D TIMELINE)
Para bater de frente com o Pro Tools e o Studio One, o layout tem que ser brutalmente utilitário. A diferença é que a interface tradicional de DAW foca em gravação e edição de áudio bruto. O Project Tesseract é uma Staging DAW de montagem paramétrica, então a interface vai herdar a organização espacial do Pro Tools, mas com a estética High-Vis Sci-Fi da BloodBound.

Aqui está o mapeamento das zonas da tela principal (Front-End) usando CSS/React mentalmente:

1. REGRAS GLOBAIS DE INTERFACE (THEME)
Geometria: border-radius: 0px. Absolutamente tudo é quadrado e afiado.

Fundo da Grid (Canvas): #050505 (Preto absoluto).

Chassi (Painéis e Barras): #1A1A1A (Cinza muito escuro).

Bordas/Divisórias: Linhas contínuas de 1px na cor #333333.

Acentos de Dados: Branco Hospitalar (#F4F4F4) para texto, e cores ácidas (Vermelho Sangue ou Amarelo Tóxico) apenas para as marcações de Colisão e Prioridade.

2. TOP BAR (TRANSPORT & GLOBAL STATUS)
A barra superior não tem botões de gravação redondos e fofos. É um painel de telemetria.

Esquerda: Transport (Play, Pause, Loop) usando ícones vetoriais simples e afiados.

Centro: Medidor Master de True Peak. Tem que ser numérico e enorme (ex: PEAK: -6.0 dB). Se o teto for rompido na montagem, o texto pisca em vermelho de alerta.

Direita: Botão de Bounding Box (O Exportador de Stems) com a nomenclatura técnica EXECUTE BOUNCE.

3. TRACK HEADERS (A SIDEBAR ESQUERDA)
É aqui que o Pro Tools brilha pela organização, mas o Tesseract injeta a inteligência algorítmica.
Cada Track Header (a caixa à esquerda da timeline) contém:

Nome da Stem: Fonte Mono (ex: IBM Plex Mono), alinhado à esquerda.

Mute / Solo: Botões clássicos [M] e [S]. Em vez de acender amarelo, o Solo inverte a cor do botão (Fundo branco, letra preta).

O Diferencial - Matriz de Tiers: Um pequeno menu dropdown quadrado ao lado do nome da track (ex: [T1], [T2], [T3]). O produtor clica e define na hora: Kick no [T1], Pad no [T3]. A cor da fonte da track muda de acordo com o Tier para leitura rápida.

Cor da Track: Uma fina barra lateral (2px) na borda esquerda ditando a cor daquela stem para o Analyzer (Additive Blending).

4. THE ARRANGER (A TIMELINE PRINCIPAL)
A grid linear, lendo da esquerda para a direita.

Os Blocos de Áudio: Em vez de renderizar waveforms detalhadas (o que consome CPU à toa na Staging), os blocos são retângulos sólidos translúcidos (opacity: 0.2) na cor da track.

Heatmap Espectral (Opcional): Dentro do bloco translúcido, você renderiza apenas manchas sólidas (heatmaps) onde há maior concentração de energia (ex: uma mancha densa no chão do bloco do Bass).

Fios de Prioridade (Visualização Opcional): Se o produtor apertar a tecla ALT, a timeline desenha linhas finas de vetores ligando o bloco do Kick [T1] ao bloco do Bass [T2], mostrando exatamente onde o software vai esculpir a equalização.

5. BOTTOM CONSOLE (A TRANSIÇÃO PARA O 3D)
Onde no Studio One ficaria o mixer tradicional, o Tesseract tem a base de controle.

Abas de Navegação: [2D TIMELINE] | [3D TESSERACT VIEW] | [SPECTRAL UNDOCK].

Clicar em [3D TESSERACT VIEW] colapsa a grid inteira e abre a Bounding Box tridimensional no centro da tela.

Clicar em [SPECTRAL UNDOCK] ejeta a janela de colisão de cores para fora do software, pronta para ser jogada no segundo monitor.

Seguindo a mesma lógica brutalista e focada em engenharia, aqui estão as próximas 5 regras de interface para fechar a fundação do Project Tesseract no modelo 2D:

6. GHOST LANES (AUTOMAÇÃO ALGORÍTMICA VISÍVEL)
No Pro Tools, você abre a pista de automação e desenha pontinhos. No Tesseract, o trabalho braçal já foi feito pela IA.

O Visual: Quando o sistema faz Gain Riding ou corta uma frequência, a automação aparece abaixo da stem como uma linha cinza translúcida (uma "Ghost Lane"). Ela mostra a rampa exata de volume que a máquina calculou.

A Interação: Você não edita os pontos com o mouse. Ao lado da pista, existe apenas um Slider de Intensidade (0% a 150%). Se a máquina reduziu o baixo em -3dB e você achou pouco, você puxa o slider para 120% e a curva inteira escala matematicamente para baixo. Controle macro, execução micro.

7. SISTEMA DE ALERTAS DE COLISÃO (THE BLEED)
Você não precisa abrir a janela do Espectrograma para saber que algo deu errado; a timeline tem que te avisar antes.

Intersecção Gráfica: Se dois blocos de áudio (ex: Kick e Synth) colidem no mesmo milissegundo com frequências concorrentes e nenhuma prioridade (Tier) foi definida para resolver o conflito, a base dos blocos na timeline "sangra".

O Efeito: Pequenos glitches de pixels vermelhos começam a piscar na borda inferior do bloco do áudio diretamente na 2D View. É um chamado visual de emergência: "Temos um problema de fase/mascaramento aqui, resolva a prioridade ou abra o Espectrograma".

8. TERMINAL DE AUDITORIA (LOG DE OPERAÇÕES)
Para manter a filosofia de "Caixa Transparente", o usuário precisa ver a máquina trabalhando.

O Posicionamento: Um pequeno painel colapsável no canto inferior esquerdo da tela, idêntico a um prompt de comando/terminal de código.

A Execução: Enquanto o áudio toca, linhas de texto em fonte Mono verde ou branca correm na tela mostrando a matemática ao vivo.

Ex: [02:14:23] TIER 1 (KICK) OVERRIDE -> TIER 2 (BASS) | -3.4dB @ 60Hz

O Valor: Isso mata a insegurança de "o que esse software está fazendo com o meu som?". Traz uma estética hacker e valida a precisão da ferramenta.

9. MINIMAP DE DENSIDADE (MACRO-NAVEGAÇÃO)
Acima da régua de compassos (onde ficam os marcadores de Intro, Drop, Break), o Tesseract usa um mapa de navegação reverso.

O Conceito: Em vez de ser apenas um zoom da música toda, o minimap é um Gráfico de Calor de LUFS/RMS.

O Visual: Uma barra contínua de 20px de altura. As partes calmas da música são blocos escuros (Cinza Chumbo). Quando entra o Drop e a energia estoura, a barra vira um bloco sólido e brilhante (Branco ou Ciano Neon). Clicar na área mais densa da barra leva o seu cursor de reprodução exatamente para o ponto de maior complexidade matemática da track.

10. CURSORES CIRÚRGICOS (FERRAMENTAS DE TELA)
O mouse não pode ser uma setinha padrão do Windows se você está operando áudio a nível milissegundo.

O Crosshair: Dentro da timeline, o cursor do mouse se transforma em uma mira tática fina de ponta a ponta da tela (linhas vertical e horizontal que cruzam o eixo X e Y).

Zero-Crossing Point Lock: Quando você aperta a tecla de atalho para fazer um corte (Split) numa stem, a linha da mira muda de branco para a cor ácida da sua paleta. O sistema tem Snap magnético obrigatório no "Ponto Zero" da forma de onda invisível. Isso garante que é matematicamente impossível você fazer um corte que gere um "click" digital ou estalo no áudio. A ferramenta não permite erro humano nesse nível.

11. 
O botão de Auto-Organização é o cérebro organizacional da 2D View. Ele elimina o "trabalho de estagiário" de agrupar tracks manualmente, permitindo que você foque direto na hierarquia de Tiers.A Lógica de Agrupamento (Pattern Recognition)Para que o Tesseract seja implacável, ele não pode apenas procurar nomes exatos; ele precisa usar Regex (Expressões Regulares) e detecção de delimitadores. A lógica funciona em três camadas:Detecção de Delimitador: O software identifica caracteres como _ (underscore), - (hífen) ou espaços. No seu exemplo MDS_Bass_01, o separador primário é _.Extração de Prefixo (Namespace): O algoritmo isola o primeiro bloco (MDS) e o segundo (Bass). Ele entende que MDS é o identificador do projeto/produtor e Bass é a categoria funcional.Criação de Bus/Pasta Virtual: Automaticamente, o software gera um "Group Track" chamado BASS GROUP. Todas as instâncias que compartilham o padrão *_Bass_* são movidas para dentro desse grupo, e a cor da track (definida na Regra 4) é herdada para todo o grupo.Implementação no Front-EndVisualmente, ao clicar em "Auto-Organize", o Project Tesseract deve realizar um "re-stacking" animado. As tracks que estavam espalhadas deslizam na vertical para se encontrarem, e uma moldura de grupo (com um ícone de colapsar v) aparece em volta delas.Abaixo, preparei uma simulação interativa para você visualizar como essa lógica de agrupamento por prefixos funciona na prática dentro da arquitetura do Tesseract.Regras Adicionais de Organização (11 a 13)11. Smart Tier Assignment: Ao agrupar os elementos, o software pode sugerir Tiers automaticamente baseados no nome. Tracks contendo "Kick" ou "Bass" recebem sugestão de Tier 1 e Tier 2 respectivamente.12. Multi-Level Collapse: Os grupos criados pelo Auto-Organize podem ser colapsados para apenas 1 linha de altura, limpando a visão 2D para que você veja apenas os "Sumários" (Busses) da mix antes de entrar na Tesseract View 3D.13. Pattern Memory: O software "aprende" o seu padrão de nomenclatura. Se você sempre usa MDS_, ele passa a ignorar esse prefixo na criação dos nomes das pastas, focando apenas no que vem depois (Bass, Lead, FX).