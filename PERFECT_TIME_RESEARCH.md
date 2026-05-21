# Perfect Time — Pesquisa e Arquitetura de Algoritmo

**Projeto:** Tesseract DAW
**Autor:** Paulo de Ávila
**Data:** 2026-05-21
**Versão:** 4.0 — Edge cases físicos + roteiro de implementação em 7 fases
**Status:** Rascunho de pesquisa / pré-implementação

---

## 1. Problema Central

Ferramentas de geração de áudio por Inteligência Artificial produzem texturas e timbres excepcionais, mas entregam áudio com **timing descontrolado**. Ao inserir um loop gerado por IA em um projeto de Techno (124 BPM) ou Neurofunk (170 BPM), onde o Kick precisa bater no milissegundo exato, o material gerado raramente está no grid.

Ferramentas existentes como o **Auto-Warp do Ableton** e o **Smart Tempo do Logic** falham porque:

- Aplicam uma única heurística para todos os tipos de material (percussão, pad, vocal, baixo).
- Produzem artefatos sonoros ao esticar transientes percussivos.
- Não distinguem material contínuo-tonal (Reese Bass) de material percussivo (Kick) — tratam os dois da mesma forma e destroem o timbre.
- Não expõem o nível de confiança do cálculo: quando erram, erram silenciosamente.

**Perfect Time** é a resposta do Tesseract: um motor que processa **um elemento por vez**, analisa a natureza do material antes de qualquer transformação, e só age quando tem confiança suficiente — caso contrário, entrega o controle ao produtor.

---

## 2. Visão e Escopo Final

> "Jogar algo fora do tempo dentro da DAW, ele analisar a relação dos elementos e a dinâmica, e colocar as coisas em grid com base no tempo. Ele vai pegar o tempo do projeto, fazer o cálculo, analisar e dar stretch e cortar o sample, e posicionar na posição correta."

**Escopo exato:**

- Processa **um elemento (stem/sample) por vez** — não é arranjo em batch.
- A análise ocorre **na ingestão** (ao arrastar o arquivo para a DAW) — pré-processamento silencioso.
- O usuário aciona o Perfect Time **quando e se desejar** — não é automático.
- Se a confiança da análise for **≥ 70%**: o motor executa e exibe sugestões (Ghost Blocks).
- Se a confiança for **< 70%**: o sistema entra em **modo âncora manual** — o usuário marca o início e o fim de 1 compasso, com pontos de ajuste adicionais opcionais, e o motor interpola o resto.

A máquina sugere. O humano executa.

---

## 3. Pipeline de Três Motores

```
[ WAV importado ]
      ↓
  MOTOR 1: Detetive (Multi-Band Onset + BPM + Confidence Score)
      ↓
  confidence ≥ 70%?
  ├── SIM → MOTOR 2: Cirurgião (Correção de Tempo)
  │              ↓
  │         MOTOR 3: Arquiteto (Ghost Blocks na timeline)
  │
  └── NÃO → Modo Âncora Manual (usuário marca compassos)
                 ↓
            Interpolação → MOTOR 2 → MOTOR 3
```

---

### Motor 1 — O Detetive

**Objetivo:** Extrair a "impressão digital rítmica" do áudio. Retornar BPM estimado, lista de transientes, classificação do material, e um `confidence_score`.

#### 1.1 Multi-Band Onset Detection

O principal erro de implementações ingênuas é varrer a energia total do arquivo. Em música eletrônica sincopada (Neurofunk, Techno Industrial), o ruído de alta frequência gerado por IA confunde a autocorrelação, fazendo um loop de 174 BPM parecer 115 BPM.

**Solução: três análises paralelas em bandas de frequência separadas.**

```
Banda A — Sub/Kick:   0 Hz – 200 Hz    → âncora primária de BPM (peso dinâmico)
Banda B — Mid/Snare:  200 Hz – 2 kHz   → âncora secundária
Banda C — Hats/Noise: 2 kHz – Nyquist  → micro-timing apenas, NUNCA para BPM
```

O algoritmo de estimativa de BPM **só confia na autocorrelação de Bandas A e B**. A Banda C é descartada do cálculo de tempo.

**Edge case — "Rumble" de IA (Sub não-rítmico):** Ferramentas como Suno e Udio frequentemente geram um ruído contínuo de grave sem pulso rítmico. Quando a Banda A está inundada por essa lama, a autocorrelação produz picos aleatórios, inflando artificialmente o `confidence_score`.

**Contramedida — Prominence Weighting via Spectral Flatness:**

Antes de somar as autocorrelações das bandas, o sistema calcula a **Spectral Flatness Measure (SFM)** da função de onset (ODF) de cada banda:

```
SFM = geometric_mean(ODF_spectrum) / arithmetic_mean(ODF_spectrum)
```

- SFM próximo de 0 → ODF tem picos nítidos → banda tem pulso rítmico real → peso normal
- SFM próximo de 1 → ODF é um ruído plano → banda é rumble não-rítmico → peso reduzido para 10%

A SFM é aplicada na **função de onset**, não na energia bruta — isso detecta aperiodicidade rítmica, não apenas intensidade.

```
peso_banda_A = 1.0 - SFM(ODF_banda_A)   // cai quando é rumble
peso_banda_B = 1.0 - SFM(ODF_banda_B)
bpm_estimado = autocorrelacao_ponderada(ODF_A * peso_A + ODF_B * peso_B)
```

Se `peso_banda_A < 0.20`, a Banda B assume controle majoritário da estimativa de BPM.

**Implementação Rust:**
```
1. Decodificar WAV (Symphonia — já disponível)
2. Aplicar 3 filtros IIR (passa-baixa 200Hz, passa-banda 200-2kHz, passa-alta 2kHz)
3. Calcular envelope de energia por janela (frame ~23ms, hop ~12ms)
4. Derivada do envelope → ODF por banda
5. Calcular SFM de cada ODF → pesos dinâmicos
6. Autocorrelação ponderada das ODFs de Bandas A+B → estimativa de BPM
7. Peaks da ODF total → lista de transientes com timestamps [ms]
```

#### 1.2 Confidence Score

Nenhum cálculo de BPM sai sem uma nota. O `confidence_score` é calculado como:

```
confidence = 1.0 - (bpm_std_deviation / bpm_estimated)
```

Onde `bpm_std_deviation` é o desvio padrão das distâncias inter-transientes na Banda A. Um loop de House com Kick no 4/4 terá desvio próximo de zero → confiança ~95%. Um loop de IA caótico terá alto desvio → confiança baixa.

**Regra de corte:** `confidence < 0.70` → **não executa o pipeline automaticamente**. Retorna ao frontend um flag `requires_manual_anchors: true`.

#### 1.3 Modo Âncora Manual (Fallback)

Quando a confiança falha, o usuário recebe o controle cirúrgico:

1. O sistema exibe a waveform do elemento na timeline.
2. O usuário clica em **exatamente 2 pontos**: início do compasso 1 e início do compasso 2.
3. Opcionalmente, pode adicionar pontos intermediários (Warp Markers manuais) para material com BPM instável.
4. O motor calcula a razão de stretch por interpolação linear (ou cúbica, se houver ≥ 3 pontos).
5. Pipeline segue para o Motor 2.

**Output do Motor 1:**
```rust
pub struct DetectiveResult {
    pub bpm_estimated: f64,
    pub confidence: f64,              // 0.0 – 1.0
    pub requires_manual_anchors: bool,
    pub transients_ms: Vec<f64>,      // timestamps de todos os onsets
    pub material_class: MaterialClass, // Percussive | Tonal | Mixed
    pub spectral_flux_variance: f64,  // usado pelo Motor 2
}
```

---

### Motor 2 — O Cirurgião

**Objetivo:** Realinhar o material ao BPM alvo do projeto sem destruir timbre ou dinâmica.

#### 2.1 Decisão de Método: Spectral Flux Variance

A heurística original `energy_ratio(low_freq / total) > 0.6` foi descartada. Ela falha em Reese Bass / Neuro Bass, que tem energia brutal nos graves mas é material **tonal e contínuo** — aplicar Slicing nele gera cliques (zero-crossing errors) no meio da modulação do LFO.

**Decisor correto: Variância do Fluxo Espectral + Spectral Flatness Measure (SFM)**

O Fluxo Espectral mede a taxa de mudança do espectro entre frames consecutivos:

```
spectral_flux[t] = Σ max(|X[t][k]| - |X[t-1][k]|, 0)
variance = std_dev(spectral_flux_frames)
```

A variância sozinha tem um falso positivo crítico: **Reese Bass com LFO agressivo**. Um wobble bass varrendo o filtro rapidamente gera alta variância espectral — o classificador o trataria como percussão e o picotaria com Slicing, gerando buracos no baixo.

**Validador duplo obrigatório — Spectral Flatness Measure (SFM):**

```
SFM = geometric_mean(|X[k]|) / arithmetic_mean(|X[k]|)
```

- SFM próximo de 0 → energia concentrada em picos harmônicos → material **tonal**
- SFM próximo de 1 → energia distribuída uniformemente → material **ruído/percussivo**

> **Nota:** Zero-Crossing Rate (ZCR) foi descartado como discriminador de tonalidade. ZCR mede brilho espectral (correlaciona com frequência), não harmonicidade. Para distinguir Reese Bass de Kick, ZCR é o instrumento errado — um kick grave e um sub oscilante podem ter ZCR similares.

**Regra de decisão completa:**

```
SE spectral_flux_variance > THRESHOLD_PERCUSSIVE AND SFM > 0.4:
    → material percussivo/ruidoso → Slicing

SE spectral_flux_variance > THRESHOLD_PERCUSSIVE AND SFM ≤ 0.4:
    → material tonal com modulação (Reese Bass, LFO) → Phase Vocoder

SE spectral_flux_variance ≤ THRESHOLD_PERCUSSIVE:
    → material tonal estável (Pad, Vocal) → Phase Vocoder
```

| Tipo de material | Flux Variance | SFM | Método |
|---|---|---|---|
| Kick, Snare | Alta | Alto (>0.4) | Slicing |
| Reese Bass + LFO agressivo | Alta | **Baixo (<0.4)** | **Phase Vocoder** |
| Pad, Textura estável | Baixa | Baixo | Phase Vocoder |
| Vocal | Média | Baixo | Phase Vocoder |
| Loop misto | Varia por janela | Varia | Detecção por janela |

O `THRESHOLD_PERCUSSIVE` precisa de calibração empírica. Valor inicial sugerido: percentil 70 da distribuição de variância em um conjunto de samples de teste com ground truth.

#### 2.2 Caminho A — Slicing

O áudio é cortado nos transientes e cada fatia é arrastada para o milissegundo correto no grid.

**Regra crítica — Pre-Roll Padding:**

O corte **nunca acontece no timestamp do onset**. Um fade-in aplicado diretamente no onset "amassa" os primeiros milissegundos do ataque — exatamente o "click" de alta frequência que dá peso ao Kick em Neurofunk.

A solução: recuar o ponto de corte em **-5ms** antes do onset. O fade-in de 2ms ocorre no silêncio de pré-ataque, terminando 3ms antes do transiente. Quando o Kick chega, a amplitude já está plena.

```
[--silêncio--][fade-in 2ms][--1ms--][KICK ATTACK]
      ↑                                    ↑
  slice_start = onset_ms - 5ms         onset_ms
```

**Edge case — Dynamic Pre-Roll Bounding (Flam / "Metralhadora"):**

O pre-roll fixo de -5ms falha quando dois transientes estão separados por menos de 5ms — flams de caixa, viradas em sequência rápida, material gerado por IA com ataques em rajada. O pré-roll da fatia N invade o território da fatia N-1, cortando seu ataque no meio.

**O pre-roll não pode ser absoluto — deve ser limitado pelo fim da fatia anterior:**

```rust
const PRE_ROLL_MS: f64 = 5.0;
const FADE_OUT_MS: f64 = 2.0;  // duração do fade-out da fatia anterior

let slice_start = {
    let ideal = onset_ms - PRE_ROLL_MS;
    let safe_boundary = if n > 0 {
        onsets_ms[n - 1] + FADE_OUT_MS  // não pode invadir o fade-out anterior
    } else {
        0.0
    };
    ideal.max(safe_boundary).max(0.0)
};
```

O `safe_boundary` usa o `FADE_OUT_MS` da fatia anterior (2ms) como margem mínima garantida — o fade-out anterior sempre termina antes do pre-roll seguinte começar.

**Regra obrigatória — Micro-Fades:**
Todo ponto de corte recebe **fade-in e fade-out de 2ms** dentro do pre-roll, nunca sobre o transiente.

```rust
fn apply_micro_fade(slice: &mut [f32], fade_ms: f32, sample_rate: u32) {
    let fade_samples = (fade_ms * sample_rate as f32 / 1000.0) as usize;
    for i in 0..fade_samples {
        let t = i as f32 / fade_samples as f32;
        slice[i] *= t;
        let end = slice.len() - 1 - i;
        slice[end] *= t;
    }
}
```

```
Caso normal:    [Onset A @ 430ms] → slice_start A @ 425ms → ataque A intacto
                [Onset B @ 440ms] → ideal B @ 435ms, safe_boundary = 432ms → slice_start B = 435ms ✓

Caso flam:      [Onset A @ 430ms] → slice_start A @ 425ms
                [Onset B @ 433ms] → ideal B @ 428ms, safe_boundary = 432ms → slice_start B = 432ms ✓
                (pre-roll de B comprimido para 1ms, mas nunca invade o fade-out de A)
```

#### 2.3 Caminho B — Phase Vocoder (Overlap-Add nativo em Rust)

**Decisão de implementação:** A `rubberband` (C++) via FFI foi descartada. O custo logístico de compilar C++ dentro de um app Tauri para Windows, macOS (M1/Intel) e Linux não justifica a qualidade incremental no contexto do Tesseract.

**Implementação própria em Rust puro usando `rustfft`:**

O método base é o **Overlap-Add (OLA)** — mas **não pode ser implementado na forma ingênua**. Um OLA básico sem travamento de fase evolui cada bin de FFT independentemente, criando inconsistências de fase entre harmônicos vizinhos de uma mesma parcial espectral. O resultado é um efeito de flanging/phasing ("som de tubo metálico") em qualquer material harmônico.

**Obrigatório: Phase-Locked Vocoder (Identity Phase Locking)**

Referência: Laroche & Dolson (1999), "Improved Phase Vocoder Time-Scale Modification of Audio", IEEE Transactions on Speech and Audio Processing.

O algoritmo adiciona uma etapa entre análise e síntese:

```
1. STFT de análise: Hann window, FFT → magnitude e fase por bin
2. Detecção de picos espectrais: identificar bins que são máximos locais de magnitude
   (esses bins são os "líderes" de cada parcial harmônica)
3. Phase Locking: para cada bin não-pico, copiar o incremento de fase do
   bin-pico mais próximo — todos os harmônicos de uma parcial rotacionam juntos
4. Síntese STFT: aplicar razão de stretch nas posições de saída
5. Overlap-Add: somar janelas sobrepostas → sinal de saída
```

```rust
pub fn phase_vocoder_stretch(
    samples: &[f32],
    stretch_ratio: f64,
    sample_rate: u32,
) -> Vec<f32>
// Internamente: STFT → peak detection → phase locking → iSTFT → OLA
```

- Não requer dependências externas além de `rustfft` (já no projeto).
- Compila em qualquer plataforma sem toolchain C++.
- Com phase locking: qualidade adequada para pads, texturas, vocais — sem o artefato de flanging do OLA ingênuo.

**Edge case — Limite Elástico / Distorção de Formantes:**

O Identity Phase Locking resolve o problema de fase mas **não preserva formantes**. Formantes são as ressonâncias físicas que definem o timbre de um instrumento ou a "garganta" de um vocal. Ao esticar além de ~±20%, os formantes se deslocam junto com o tempo: um vocal esticado 30% (170→124 BPM) adquire uma qualidade robótica inconfundível.

**Regra de Segurança — Stretch Ratio Limiter:**

Formant Preservation via LPC (Linear Predictive Coding) não está no escopo desta implementação. A proteção é uma trava de UX baseada em limiar confirmado na literatura (Laroche & Dolson, 1999):

```rust
pub enum StretchQuality { Safe, Warning }

pub fn classify_stretch(ratio: f64, material: &MaterialClass) -> StretchQuality {
    // Percussão sintética tolera stretch mais agressivo (sem formantes naturais)
    let limit = match material {
        MaterialClass::Tonal => 0.20,   // ±20% para vocais/instrumentos
        MaterialClass::Percussive => 0.35,
        MaterialClass::Mixed => 0.20,   // conservador no caso ambíguo
    };
    if (ratio - 1.0).abs() > limit {
        StretchQuality::Warning
    } else {
        StretchQuality::Safe
    }
}
```

Quando `StretchQuality::Warning`, o Ghost Block é renderizado em **amarelo** no frontend com a mensagem: *"Correção extrema detectada — artefatos de timbre prováveis."* O usuário pode aceitar mesmo assim ou ajustar manualmente via âncoras.

#### 2.4 Âncora Matemática: DTW sobre Lista de Transientes (Macro-DTW)

O DTW cria o mapa de correspondência entre o tempo do áudio original e o grid do projeto. Em vez de aplicar uma razão de stretch uniforme, o DTW permite que a velocidade varie ao longo do arquivo, compensando o BPM instável do material de IA.

**Regra crítica de complexidade — DTW NUNCA opera em samples brutos.**

DTW tem complexidade O(N²). Aplicado em samples brutos de 1 minuto (2.6M samples @ 44.1kHz): matriz de **6.76 trilhões de células** → travar a máquina imediatamente.

**O DTW opera exclusivamente sobre a lista de transientes detectados pelo Motor 1.**

Um stem de 1 minuto tem ~200 transientes. A matriz DTW é 200×200 = 40.000 células = operação trivial em microssegundos.

```
Transientes originais: [0ms, 430ms, 930ms, 1400ms, ...]    (~200 pontos)
Batidas do grid:       [0ms, 500ms, 1000ms, 1500ms, ...]   (~200 batidas)
DTW mapping:            0→0, 430→500, 930→1000, 1400→1500
```

O áudio **entre transientes** não passa pelo DTW — ele herda a razão de stretch calculada por interpolação linear entre os dois transientes âncora vizinhos. A interpolação é aplicada à *warp curve* (mapa de tempo→tempo), não ao áudio diretamente.

```rust
// Pseudo-código do Macro-DTW
let transients: Vec<f64> = detective_result.transients_ms;  // ~200 pontos
let grid_beats: Vec<f64> = generate_grid(project_bpm, transients.len());
let warp_map: Vec<(f64, f64)> = dtw_align(&transients, &grid_beats);
// warp_map[i] = (tempo_original_ms, tempo_alvo_ms)
// stretch_ratio entre transientes = interpolação linear sobre warp_map
```

---

### Motor 3 — O Arquiteto

**Objetivo:** Após a correção de tempo, analisar o elemento e sugerir sua posição na timeline. **Nunca modificar a timeline automaticamente.**

#### 3.1 Ghost Blocks — Interface de Sugestão

O JSON gerado pelo Arquiteto **não altera a timeline**. Ele renderiza **blocos fantasmas translúcidos** nos locais sugeridos. O usuário decide:

- **Enter / Aceitar**: o Ghost Block se solidifica na posição sugerida.
- **Arrastar**: o usuário reposiciona o bloco para onde quiser — a correção de tempo já foi aplicada.
- **Rejeitar**: o bloco desaparece, o elemento volta ao estado pré-processado.

Este paradigma mantém a inteligência da máquina sem remover o controle do produtor. A ferramenta sugere uma posição com base em análise espectral, mas a intenção musical pertence ao humano.

#### 3.2 Lógica de Sugestão de Posição

Com o elemento já no tempo correto, o Arquiteto analisa seu `material_class` e o contexto das trilhas já existentes na timeline:

```
SE material_class == Percussive AND freq_centroid < 200Hz:
    → sugerir na cabeça do compasso (beat 0)

SE material_class == Percussive AND freq_centroid > 2kHz:
    → sugerir no contratempo (beat 0.5)

SE material_class == Tonal AND freq_range ⊂ [20, 200] Hz:
    → sugerir junto ao elemento de sub-grave existente (mesma posição)
    → sinalizar potencial colisão espectral (conectar com Motor DSP da Fase 1)

SE material_class == Tonal AND freq_range ⊂ [200, 4000] Hz:
    → sugerir em layer sobre o compasso inteiro
```

#### 3.3 Output do Arquiteto

```rust
pub struct ArchitectSuggestion {
    pub suggested_beat: f64,          // posição no grid em beats
    pub suggested_bar: u32,
    pub confidence: f64,
    pub collision_warning: bool,      // colisão espectral com elemento existente
    pub collision_element_id: Option<String>,
}
```

O `collision_warning` conecta o Perfect Time ao motor de mascaramento espectral da Fase 1 do Tesseract — o Arquiteto pode avisar: "esse sub vai colidir com o kick que já está aqui".

---

## 4. Fluxo Completo do Usuário

```
1. Usuário arrasta WAV para a DAW
   → Motor 1 roda silenciosamente em background (pré-análise na ingestão)
   → DetectiveResult é cacheado na stem

2. Usuário clica em "Perfect Time" no elemento
   → IF confidence ≥ 0.70:
       Motor 2 processa (Slicing ou Phase Vocoder por Spectral Flux Variance)
       Motor 3 gera Ghost Block na posição sugerida
       Usuário aceita, ajusta, ou rejeita

   → IF confidence < 0.70:
       Timeline mostra waveform + prompt: "Marque o início e fim de 1 compasso"
       Usuário clica 2+ âncoras
       Motor 2 processa com razão interpolada
       Motor 3 gera Ghost Block
       Usuário aceita, ajusta, ou rejeita

3. Usuário confirma → elemento entra na timeline no tempo certo
```

---

## 5. Fundamentos Científicos

### 5.1 MIR — Music Information Retrieval

Campo da computação que estuda extração e organização lógica de dados musicais.

- Conferência central: **ISMIR** (International Society for Music Information Retrieval).
- Subcampos relevantes: Beat Tracking, Onset Detection, Music Structure Analysis.

### 5.2 Dynamic Time Warping (DTW)

- Algoritmo de alinhamento de séries temporais, complexidade O(n²), versão otimizada FastDTW em O(n).
- No áudio: alinhamento de performances com partituras (Score Following), sincronização de versões.
- Para o Perfect Time: cria o mapa de warp entre timeline original e grid do projeto.

### 5.3 Phase Vocoder com Identity Phase Locking

- Técnica de Time-Stretching baseada em STFT com acumulação de fase.
- OLA básico sem phase locking produz flanging/"phasiness" em material harmônico — inaceitável.
- **Identity Phase Locking** (Laroche & Dolson, 1999): bins FFT são agrupados por picos espectrais; todos os bins de uma mesma parcial harmônica compartilham o mesmo incremento de fase. Elimina o artefato de phasiness.
- Implementação nativa em Rust via `rustfft` — adiciona peak detection e phase propagation ao OLA padrão.

### 5.4 Spectral Flux e Spectral Flatness Measure (SFM)

- **Spectral Flux:** taxa de variação do espectro entre frames. Alta variância → percussivo. Baixa → tonal.
- **SFM:** razão entre média geométrica e aritmética do espectro. Próximo de 0 = energia em picos harmônicos (tonal). Próximo de 1 = energia distribuída (ruído). Discrimina Reese Bass com LFO (SFM baixo) de Kick (SFM alto).
- Referência Flux: Scheirer (1998), "Tempo and beat analysis of acoustic musical signals", JASA.

### 5.5 Multi-Band Onset Detection com Prominence Weighting

- Separação em 3 bandas (sub-grave, médio, agudo) previne que ruído de IA polua a estimativa de BPM.
- Prominence Weighting via SFM na ODF: banda sem pulso rítmico (rumble contínuo) tem peso dinâmico reduzido a ~10%.
- Referência: Bello et al. (2005), "A Tutorial on Onset Detection in Music Signals", IEEE Transactions on Speech and Audio Processing.

### 5.6 Estado da Arte — Por que Perfect Time é Original

| Sistema | Onset | BPM | Decisão por material | Phase Locking | Ghost UI | Offline | Por elemento |
|---|---|---|---|---|---|---|---|
| Ableton Auto-Warp | Sim | Sim | Não | Não | Não | Sim | Não |
| Logic Smart Tempo | Sim | Sim | Não | Desconhecido | Não | Sim | Não |
| Loudly/Melyum | Sim | Sim | Parcial | Desconhecido | Não | **Não** | Não |
| **Perfect Time** | **Multi-band + SFM** | **+ Confidence + PAW** | **Flux+SFM** | **Identity Locking** | **Sim** | **Sim** | **Sim** |

O diferencial científico: pipeline integrado com (1) roteamento inteligente por tipo de material via duplo discriminador (Flux + SFM), (2) Phase Vocoder com identity phase locking nativo, (3) Macro-DTW sobre transientes, (4) fallback de âncoras manuais com confidence score, e (5) interface não-destrutiva — tudo offline, por elemento.

---

## 6. Arquitetura de Código

### Padrão Assíncrono Obrigatório (Async Job Queue)

**O problema:** `#[tauri::command]` via `invoke()` bloqueia a thread de chamada até retornar. Para um stem de 3 minutos, o processamento pode levar 15-20 segundos — a UI do React congela completamente, o usuário fecha o app no Gerenciador de Tarefas.

**Regra:** nenhum command de Perfect Time retorna resultado diretamente. Todos retornam `job_id` imediatamente e emitem evento ao concluir.

```
React: invoke("perfect_time_analyze", { stemPath, bpm })
           ↓ retorna em < 5ms
Tauri: { status: "queued", job_id: 42 }
           ↓ UI continua livre
Rust:  tokio::spawn_blocking(|| { ... análise pesada ... })
           ↓ quando terminar
Tauri: app_handle.emit("perfect_time_analyzed", DetectiveResult)
           ↓
React: listen("perfect_time_analyzed", (event) => { exibir Ghost Block })
```

### Command Tauri

```rust
// commands.rs

#[tauri::command]
pub async fn perfect_time_analyze(
    stem_path: String,
    project_bpm: f64,
    app: tauri::AppHandle,
) -> Result<JobQueued, String> {
    let handle = app.clone();
    tokio::spawn(async move {
        let result = run_detective(&stem_path, project_bpm);
        handle.emit("perfect_time_analyzed", &result).ok();
    });
    Ok(JobQueued { job_id: next_job_id() })
}

#[tauri::command]
pub async fn perfect_time_process(
    stem_path: String,
    project_bpm: f64,
    anchors: Option<Vec<AnchorPoint>>,
    app: tauri::AppHandle,
) -> Result<JobQueued, String> {
    let handle = app.clone();
    tokio::spawn(async move {
        let result = run_surgeon_and_architect(&stem_path, project_bpm, anchors);
        handle.emit("perfect_time_processed", &result).ok();
    });
    Ok(JobQueued { job_id: next_job_id() })
}

pub struct JobQueued { pub job_id: u32 }
```

### Structs Rust

```rust
pub struct DetectiveResult {
    pub bpm_estimated: f64,
    pub confidence: f64,
    pub requires_manual_anchors: bool,
    pub transients_ms: Vec<f64>,        // lista ~200 pontos — entrada do Macro-DTW
    pub material_class: MaterialClass,
    pub spectral_flux_variance: f64,
    pub spectral_flatness: f64,         // SFM médio — distingue tonal vs. ruidoso
    pub band_weights: [f64; 3],         // pesos dinâmicos das Bandas A, B, C
}

pub enum MaterialClass { Percussive, Tonal, Mixed }

pub struct AnchorPoint {
    pub time_ms: f64,    // posição no áudio original
    pub beat: f64,       // posição correspondente no grid do projeto
}

pub struct PerfectTimeResult {
    pub output_path: String,          // WAV processado em cache temporário
    pub stretch_ratio: f64,
    pub method_used: StretchMethod,
    pub architect_suggestion: ArchitectSuggestion,
}

pub enum StretchMethod { Slicing, PhaseVocoder }

pub struct ArchitectSuggestion {
    pub suggested_beat: f64,
    pub suggested_bar: u32,
    pub confidence: f64,
    pub collision_warning: bool,
    pub collision_element_id: Option<String>,
}
```

### Dependências Rust

```toml
# Cargo.toml — nenhuma nova dependência externa necessária
# rustfft — já disponível no projeto (Phase Vocoder OLA)
# symphonia — já disponível (decodificação WAV)
# rayon — já disponível (paralelismo para análise multi-banda)
# ndarray — já disponível (operações matriciais para DTW)
```

O pipeline completo é implementável com as dependências já existentes no projeto.

### Frontend React

```typescript
// projectStore.ts — novos campos
interface StemState {
  detectiveResult?: DetectiveResult;   // cacheado na ingestão
  ghostBlock?: ArchitectSuggestion;    // sugestão pendente de confirmação
  processingState: 'idle' | 'analyzing' | 'awaiting_anchors' | 'processed';
}
```

O `ArrangementView.tsx` renderiza os Ghost Blocks como blocos translúcidos sobre a timeline, distinguíveis visualmente dos blocos confirmados.

---

## 7. Questões em Aberto

1. **Calibração do `THRESHOLD_PERCUSSIVE`:** O valor de corte para Spectral Flux Variance precisa de validação empírica com um conjunto diverso de samples (Kick, Reese Bass, Pad, Vocal). Abordagem: criar um script de teste que roda o classificador em 50+ samples com ground truth conhecido.

2. **Curvatura máxima do DTW:** Quanto o algoritmo pode "dobrar" a linha do tempo sem soar não-natural? Um material que oscila ±20% do BPM pode precisar de correção agressiva — qual é o limite perceptível antes de soar mecânico?

3. **Cache do DetectiveResult:** A análise na ingestão precisa ser rápida (< 200ms para não bloquear a UI) ou ser feita em thread separada. Rayon resolve o paralelismo da análise multi-banda, mas o benchmark precisa ser validado com arquivos reais de 8–16 bars.

4. **Ghost Blocks e undo:** Se o usuário aceitar um Ghost Block e depois quiser desfazer, o sistema precisa manter o WAV original intacto. O `output_path` deve sempre ser um arquivo temporário separado, nunca sobrescrever o original.

5. **Hats e micro-timing:** A Banda C (> 2kHz) foi excluída do cálculo de BPM mas ainda precisa de posicionamento. Um hat que a IA gerou no contratempo deve permanecer no contratempo após a correção — o DTW precisa tratar transientes de alta frequência como "passageiros" que se movem junto com a warp curve calculada pelos graves.

---

## 8. Roteiro de Implementação

O pipeline é dividido em 7 fases de desenvolvimento. Cada fase tem entregável claro e é bloqueante para a próxima — não deve começar a Fase N+1 sem o entregável da Fase N validado com samples reais.

---

### Fase 1 — Primitivas DSP

**Dependências:** nenhuma
**Entregável:** módulo `dsp_primitives.rs` com funções reutilizáveis por todos os motores

- [ ] Filtros IIR passa-baixa (200Hz), passa-banda (200–2kHz), passa-alta (2kHz) com coeficientes calculados por Butterworth de 2ª ordem
- [ ] Janela de Hann e cálculo de STFT (análise e síntese) via `rustfft`
- [ ] Cálculo de envelope de energia por janela (frame ~23ms, hop ~12ms)
- [ ] Cálculo de Spectral Flatness Measure (SFM) por frame
- [ ] Cálculo de Spectral Flux por frame (soma de diferenças positivas entre espectros consecutivos)
- [ ] **Critério de validação:** rodar em Kick.wav e Pad.wav conhecidos, confirmar SFM alto (Kick) vs. baixo (Pad)

---

### Fase 2 — Motor 1: Detetive (Análise Automática)

**Dependências:** Fase 1
**Entregável:** `detective.rs` + Tauri command `perfect_time_analyze` (assíncrono)

- [ ] ODF por banda (derivada do envelope de energia) para as 3 bandas
- [ ] SFM de cada ODF → peso dinâmico por banda (band_weights[3])
- [ ] Autocorrelação ponderada das ODFs de Bandas A+B → `bpm_estimated`
- [ ] Desvio padrão inter-transiente → `confidence_score`
- [ ] Lista de peaks da ODF total → `transients_ms: Vec<f64>` (~200 pontos por minuto)
- [ ] Classificação preliminar de `material_class` via SFM médio + Flux Variance
- [ ] Serialização de `DetectiveResult` para JSON (serde)
- [ ] Command `perfect_time_analyze` com padrão assíncrono: retorna `JobQueued`, emite `"perfect_time_analyzed"`
- [ ] **Critério de validação:** BPM estimado ±2 BPM em samples de 90, 124, 140 e 174 BPM; confidence > 0.70 em material limpo

---

### Fase 3 — Motor 1: Modo Âncora Manual (Fallback)

**Dependências:** Fase 2
**Entregável:** extensão do fluxo para `confidence < 0.70`

- [ ] Tauri command `perfect_time_set_anchors(stem_id, anchors: Vec<AnchorPoint>)`
- [ ] Validação de âncoras: mínimo 2 pontos, ordem cronológica, distância mínima de 100ms
- [ ] Interpolação linear da warp curve entre âncoras (ou cúbica se ≥ 3 pontos)
- [ ] Frontend: modo de edição de âncoras no `ArrangementView.tsx` — clicar na waveform posiciona marcadores visuais
- [ ] **Critério de validação:** corrigir um sample com BPM desconhecido colocando 2 âncoras; ouvir resultado no tempo correto

---

### Fase 4 — Motor 2: Classificador e Slicing

**Dependências:** Fase 2
**Entregável:** `slicer.rs` — material percussivo corrigido por fatiamento

- [ ] Dual check de material: Spectral Flux Variance + SFM → enum `MaterialClass`
- [ ] Macro-DTW sobre `transients_ms` vs. grade de batidas do projeto (operação de 200×200 células máximo)
- [ ] Geração da warp curve: `Vec<(f64, f64)>` mapeando tempo original → tempo alvo
- [ ] Dynamic Pre-Roll Bounding: `slice_start[N] = max(onset_ms[N] - 5.0, onset_ms[N-1] + 2.0).max(0.0)`
- [ ] Micro-fades de 2ms em todo ponto de corte (dentro do pre-roll, nunca sobre o transiente)
- [ ] Cálculo de `stretch_ratio` médio para classificar `StretchQuality` (Safe/Warning)
- [ ] Reposicionamento das fatias no grid e escrita do WAV de saída em cache temporário
- [ ] **Critério de validação:** kick a 170 BPM processado para 124 BPM; ouvir ataque intacto, sem cliques, sem fofo

---

### Fase 5 — Motor 2: Phase Vocoder com Identity Phase Locking

**Dependências:** Fase 1, Fase 4 (classificador)
**Entregável:** `phase_vocoder.rs` — material tonal corrigido sem artefatos de fase

- [ ] STFT de análise com janela de Hann e hop size ajustável
- [ ] Detecção de picos espectrais (máximos locais de magnitude no espectro)
- [ ] Identity Phase Locking: para cada bin não-pico, copiar o incremento de fase do bin-pico mais próximo (Laroche & Dolson, 1999)
- [ ] STFT de síntese com razão de stretch aplicada às posições de janela
- [ ] Overlap-Add das janelas de síntese → sinal de saída
- [ ] `classify_stretch(ratio, material_class)` → `StretchQuality` (mesmo flag da Fase 4)
- [ ] Escrita do WAV de saída em cache temporário
- [ ] **Critério de validação:** pad sintetizado esticado 15%; ouvir sem flanging. Vocal esticado 25%; verificar warning amarelo no Ghost Block

---

### Fase 6 — Motor 3: Arquiteto e Ghost Blocks

**Dependências:** Fase 4 ou Fase 5 (elemento processado no tempo)
**Entregável:** `architect.rs` + componente `GhostBlock.tsx`

- [ ] Calcular centroide espectral do WAV processado
- [ ] Lógica de sugestão de posição no grid (regras por `material_class` + `freq_centroid`)
- [ ] Verificação de colisão espectral com elementos já na timeline (via `projectStore`)
- [ ] Serialização de `ArchitectSuggestion` + campo `stretch_quality` para o frontend
- [ ] Componente `GhostBlock.tsx`: bloco translúcido sobre a timeline, cor dinâmica (normal / amarelo para Warning)
- [ ] Interações: Enter = solidificar na posição sugerida, arrastar = reposicionar, Esc = rejeitar
- [ ] `projectStore.ts`: novo campo `ghostBlocks: Map<stemId, ArchitectSuggestion>`
- [ ] **Critério de validação:** processar 3 samples diferentes; cada um aparece como Ghost Block na posição correta; aceitar, rejeitar e arrastar funcionam

---

### Fase 7 — Integração, Calibração e Testes

**Dependências:** Fases 1–6
**Entregável:** pipeline completo funcional com thresholds calibrados

- [ ] Coletar conjunto de testes: ≥ 50 samples com `material_class` conhecido (Kick, Reese Bass, Pad, Vocal, Loop misto)
- [ ] Calibrar `THRESHOLD_PERCUSSIVE` (percentil 70 da distribuição de Flux Variance no conjunto)
- [ ] Calibrar threshold de SFM (valor inicial 0.4, ajustar empiricamente)
- [ ] Calibrar `safe_margin` do pre-roll (validar em samples com flams reais)
- [ ] Benchmark de latência: análise ≤ 200ms @ 4 bars 44.1kHz; processamento ≤ 500ms @ 4 bars
- [ ] Testes com samples gerados por IA (Suno, Udio, Stable Audio) — validar o fallback de âncoras ativando corretamente abaixo de 70% de confiança
- [ ] Teste de edge case: sample com 3 minutos (benchmark de non-blocking UI)
- [ ] Teste de flam: dois transientes a 3ms de distância — verificar Dynamic Pre-Roll Bounding

---

## Referências

- **Müller, M. (2015).** *Fundamentals of Music Processing.* Springer. — Cap. 3 (Onset), Cap. 6 (DTW).
- **Zölzer, U. (2011).** *DAFX: Digital Audio Effects.* Wiley. — Cap. 7 (Phase Vocoder / OLA).
- **Laroche, J. & Dolson, M. (1999).** "Improved Phase Vocoder Time-Scale Modification of Audio." *IEEE Transactions on Speech and Audio Processing*, 7(3), 323–332. — **Referência central para Identity Phase Locking.**
- **Puckette, M. (1995).** "Phase-locked vocoder." *Proceedings of IEEE ASSP Workshop on Applications of Signal Processing to Audio and Acoustics.* — Origem do phase locking em vocoders.
- **Bello, J.P. et al. (2005).** "A Tutorial on Onset Detection in Music Signals." *IEEE Transactions on Speech and Audio Processing*, 13(5). — Multi-band onset, ODF methods.
- **Scheirer, E. (1998).** "Tempo and beat analysis of acoustic musical signals." *Journal of the Acoustical Society of America*, 103(1). — Spectral flux e beat tracking.
- **Böck, S. et al. (2013).** "Maximum filter vibrato suppression for onset detection." *Proceedings of the 16th DAFX Conference* (SuperFlux). — Onset de alta precisão em percussão.
- **ISMIR Proceedings** (ismir.net) — buscar: "beat tracking", "onset detection", "spectral flatness", "audio time stretching".
- **Essentia** (essentia.upf.edu) — toolbox MIR open-source do MTG Barcelona, implementações de referência de SFM, Onset, Beat Tracking.
