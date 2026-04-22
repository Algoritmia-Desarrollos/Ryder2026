document.addEventListener('DOMContentLoaded', async () => {
    // ========================================================
    // 1. CONFIGURACIÓN INICIAL Y CLIENTE SUPABASE
    // ========================================================
    const SUPABASE_URL = 'https://amykozyxbgyqadllgdon.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_3tpA0w6H04r7zi_N8zub7w_CeYcr34a';

    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase client inicializado.");

    // ========================================================
    // 2. SELECTORES DEL DOM Y ESTRUCTURAS DE DATOS
    // ========================================================
    const sidebar = document.getElementById('sidebar');
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const sidebarLinks = document.querySelectorAll('.sidebar nav ul li');
    const contentArea = document.querySelector('.content');

    const defaultAppDataStructure = {
        tournamentName: "Copa Ryder (No Cargada)",
        location: "Club de Golf (No Cargado)",
        pointsNeededToWin: 14.5,
        teams: {
            tortugas: { id: null, key: "tortugas", name: "Tortugas", color: "#28a745", logo: "../tortuga.webp", players: [], score: 0 },
            salmones: { id: null, key: "salmones", name: "Salmones", color: "#dc3545", logo: "../salmon.webp", players: [], score: 0 }
        },
        rounds: [],
        tournamentInfo: {
            dates: "N/A",
            locationName: "N/A",
            locationAddress: "N/A",
            venueWebsite: "#",
            startTime: "N/A",
            directionsLink: "#"
        },
        additionalDetails: { schedule: [] },
        rules: ["Reglas no cargadas."]
    };

    let appData = JSON.parse(JSON.stringify(defaultAppDataStructure));
    let isAdmin = localStorage.getItem('ryderAdmin') === 'true';
    let adminPassword = 'Admin123';

    // ========================================================
    // 3. DEFINICIÓN DE TODAS LAS FUNCIONES
    // ========================================================

    function darkenColor(hex, percent) {
        if (!hex || typeof hex !== 'string') return '#CCCCCC';
        hex = hex.replace(/^\s*#|\s*$/g, '');
        if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
        let r = parseInt(hex.substring(0, 2), 16) || 0;
        let g = parseInt(hex.substring(2, 4), 16) || 0;
        let b = parseInt(hex.substring(4, 6), 16) || 0;
        r = Math.max(0, Math.floor(r * (100 - percent) / 100));
        g = Math.max(0, Math.floor(g * (100 - percent) / 100));
        b = Math.max(0, Math.floor(b * (100 - percent) / 100));
        const rr = r.toString(16).padStart(2, '0');
        const gg = g.toString(16).padStart(2, '0');
        const bb = b.toString(16).padStart(2, '0');
        return `#${rr}${gg}${bb}`.toUpperCase();
    }

    async function loadAppDataFromSupabase() {
        console.log("Iniciando carga de datos desde Supabase...");
        const newAppData = JSON.parse(JSON.stringify(defaultAppDataStructure));
        const teamIdToKeyMap = {};
        try {
            console.log("Paso 1: Cargando config...");
            const { data: config, error: configError } = await supabaseClient.from('tournament_config').select('*').limit(1).single();
            if (configError && configError.code !== 'PGRST116') { console.warn("Advertencia cargando config:", configError.message); }
            else if (config) {
                Object.assign(newAppData, {
                    tournamentName: config.tournament_name,
                    location: config.location,
                    pointsNeededToWin: config.points_needed_to_win,
                    tournamentInfo: config.tournament_info || defaultAppDataStructure.tournamentInfo,
                    additionalDetails: config.additional_details || defaultAppDataStructure.additionalDetails,
                    rules: config.rules || defaultAppDataStructure.rules
                });
                if (config.admin_password) {
                    adminPassword = config.admin_password;
                }
            }

            console.log("Paso 2: Cargando equipos...");
            const { data: teamsList, error: teamsError } = await supabaseClient.from('teams').select('*');
            if (teamsError) throw new Error(`Cargando equipos: ${teamsError.message}`);
            if (teamsList) {
                for (const team of teamsList) {
                    if (newAppData.teams[team.key_name]) {
                        Object.assign(newAppData.teams[team.key_name], { id: team.id, key: team.key_name, name: team.name, color: team.color, logo: defaultAppDataStructure.teams[team.key_name]?.logo || team.logo_url, players: [], score: team.score || 0 });
                        teamIdToKeyMap[team.id] = team.key_name;
                    }
                }
            }

            console.log("Paso 3: Cargando jugadores...");
            const { data: playersList, error: playersError } = await supabaseClient.from('players').select('*');
            if (playersError) throw new Error(`Cargando jugadores: ${playersError.message}`);
            if (playersList) {
                playersList.forEach(player => {
                    const teamKeyForPlayer = teamIdToKeyMap[player.team_id];
                    if (teamKeyForPlayer) {
                        const team = newAppData.teams[teamKeyForPlayer];
                        if (team && Array.isArray(team.players)) { team.players.push({ id: player.id, name: player.name, initials: player.initials, points: player.points || 0 }); }
                    } else { console.warn(`Jugador ${player.id} con team_id ${player.team_id} no mapeado.`); }
                });
            }

            console.log("Paso 4: Cargando rondas y partidos...");
            const { data: roundsList, error: roundsError } = await supabaseClient.from('rounds').select('*, matches(*)').order('id', { ascending: true });
            if (roundsError) throw new Error(`Cargando rondas: ${roundsError.message}`);
            if (roundsList) {
                newAppData.rounds = roundsList.map(round => ({
                    id: round.id, name: round.name, format: round.format, course: round.course, date: round.date, time: round.time, status: round.status,
                    matches: Array.isArray(round.matches) ? round.matches.map(match => ({ id: match.id, tortugas: match.tortugas_players || [], salmones: match.salmones_players || [], result: match.result, winner: match.winner })) : [],
                    scores: { tortugas: round.scores_tortugas || 0, salmones: round.scores_salmones || 0 }
                }));
            }
            console.log("Datos de Supabase cargados y procesados.", newAppData);
            return newAppData;
        } catch (error) {
            console.error("FALLO CRÍTICO en loadAppDataFromSupabase:", error);
            alert(`No se pudieron cargar datos: ${error.message}. Usando estructura por defecto.`);
            return JSON.parse(JSON.stringify(defaultAppDataStructure));
        }
    }

    async function calculateAndSyncScores() {
        let tortugasTotalScore = 0; let salmonesTotalScore = 0;
        const roundScoreUpdatePromises = []; const teamScoreUpdatePromises = [];
        const tortugasTeamData = appData.teams?.tortugas;
        const salmonesTeamData = appData.teams?.salmones;

        if (!tortugasTeamData || !salmonesTeamData) {
            console.warn("Datos de equipos no disponibles para calcular scores.");
            return;
        }

        (appData.rounds || []).forEach(round => {
            let currentRoundTortugasScore = 0; let currentRoundSalmonesScore = 0;
            if (Array.isArray(round.matches)) {
                round.matches.forEach(match => {
                    if (match.winner === 'tortugas') currentRoundTortugasScore += 1;
                    else if (match.winner === 'salmones') currentRoundSalmonesScore += 1;
                    else if (match.winner === 'empate') { currentRoundTortugasScore += 0.5; currentRoundSalmonesScore += 0.5; }
                });
            }
            round.scores = { tortugas: currentRoundTortugasScore, salmones: currentRoundSalmonesScore };
            tortugasTotalScore += currentRoundTortugasScore; salmonesTotalScore += currentRoundSalmonesScore;
            if (round.id) roundScoreUpdatePromises.push(supabaseClient.from('rounds').update({ scores_tortugas: currentRoundTortugasScore, scores_salmones: currentRoundSalmonesScore }).eq('id', round.id));
        });

        tortugasTeamData.score = tortugasTotalScore;
        salmonesTeamData.score = salmonesTotalScore;

        const allMatchesAcrossRounds = appData.rounds.reduce((acc, r) => acc.concat(r.matches || []), []);
        const playerPerformance = calculatePlayerPerformancePoints(allMatchesAcrossRounds, appData.teams);

        if (Array.isArray(tortugasTeamData.players)) {
            tortugasTeamData.players.forEach(player => {
                player.points = playerPerformance[player.name] || 0;
            });
        }
        if (Array.isArray(salmonesTeamData.players)) {
            salmonesTeamData.players.forEach(player => {
                player.points = playerPerformance[player.name] || 0;
            });
        }

        if (tortugasTeamData.id) teamScoreUpdatePromises.push(supabaseClient.from('teams').update({ score: tortugasTotalScore }).eq('id', tortugasTeamData.id));
        if (salmonesTeamData.id) teamScoreUpdatePromises.push(supabaseClient.from('teams').update({ score: salmonesTotalScore }).eq('id', salmonesTeamData.id));

        try {
            await Promise.all([...roundScoreUpdatePromises, ...teamScoreUpdatePromises]);
            console.log("Scores sincronizados con Supabase (incluyendo actualización de puntos de jugador en appData).");
        }
        catch (error) { console.error("Error sincronizando scores con Supabase:", error); }
    }

    function renderHomePage() {
        const tortugasTeam = appData.teams?.tortugas || defaultAppDataStructure.teams.tortugas;
        const salmonesTeam = appData.teams?.salmones || defaultAppDataStructure.teams.salmones;
        const tortugasScore = tortugasTeam.score || 0;
        const salmonesScore = salmonesTeam.score || 0;
        const pointsNeededToWinTournament = appData.pointsNeededToWin || defaultAppDataStructure.pointsNeededToWin;
        const tournamentName = appData.tournamentName || defaultAppDataStructure.tournamentName;
        const location = appData.location || defaultAppDataStructure.location;

        let leadingTeamText = "";
        let tortugasPointsToLeadText = "";
        let salmonesPointsToLeadText = "";

        if (tortugasScore > salmonesScore) {
            leadingTeamText = `${tortugasTeam.name.toUpperCase()} LIDERANDO`;
            const diff = tortugasScore - salmonesScore;
            salmonesPointsToLeadText = `${(diff + 0.5).toFixed(1)} pts para superar`;
            tortugasPointsToLeadText = `Lidera por ${diff.toFixed(1)} pts`;
        } else if (salmonesScore > tortugasScore) {
            leadingTeamText = `${salmonesTeam.name.toUpperCase()} LIDERANDO`;
            const diff = salmonesScore - tortugasScore;
            tortugasPointsToLeadText = `${(diff + 0.5).toFixed(1)} pts para superar`;
            salmonesPointsToLeadText = `Lidera por ${diff.toFixed(1)} pts`;
        } else if (tortugasScore === salmonesScore && (tortugasScore > 0 || salmonesScore > 0)) {
            leadingTeamText = "EMPATE";
            tortugasPointsToLeadText = `0.5 pts para liderar`;
            salmonesPointsToLeadText = `0.5 pts para liderar`;
        } else {
            leadingTeamText = "EL TORNEO AÚN NO COMIENZA O NO HAY PUNTOS";
            tortugasPointsToLeadText = ``; 
            salmonesPointsToLeadText = ``;
        }
        
        if (tortugasScore >= pointsNeededToWinTournament && tortugasScore > salmonesScore) {
            leadingTeamText = `¡${tortugasTeam.name.toUpperCase()} HA GANADO EL TORNEO!`;
            tortugasPointsToLeadText = "Campeón"; salmonesPointsToLeadText = "-";
        } else if (salmonesScore >= pointsNeededToWinTournament && salmonesScore > tortugasScore) {
            leadingTeamText = `¡${salmonesTeam.name.toUpperCase()} HA GANADO EL TORNEO!`;
            salmonesPointsToLeadText = "Campeón"; tortugasPointsToLeadText = "-";
        } else if (tortugasScore >= pointsNeededToWinTournament && salmonesScore >= pointsNeededToWinTournament && tortugasScore === salmonesScore){
             leadingTeamText = `¡EMPATE EN EL TORNEO!`;
             tortugasPointsToLeadText = "Empate Torneo"; salmonesPointsToLeadText = "Empate Torneo";
        }

        return `<div class="content-section">
            <div class="standings-header">
                <h1>Clasificación Ryder Cup ${new Date().getFullYear()}</h1>
                <p>${location}</p>
            </div>
            <div class="scoreboard">
                <div class="team-score team-tortugas" style="background-color: ${tortugasTeam.color};">
                    ${tortugasTeam.logo ? `<img src="${tortugasTeam.logo}" alt="${tortugasTeam.name} Logo" class="team-logo">` : ''}
                    <div class="team-info">
                        <div class="team-name">${tortugasTeam.name.toUpperCase()}</div>
                        <div class="points-to-lead">${tortugasPointsToLeadText}</div>
                    </div>
                    <div class="score">${tortugasScore.toFixed(1)}</div>
                </div>
                <div class="vs">VS</div>
                <div class="team-score team-salmones" style="background-color: ${salmonesTeam.color};">
                    <div class="score">${salmonesScore.toFixed(1)}</div>
                    <div class="team-info">
                        <div class="team-name">${salmonesTeam.name.toUpperCase()}</div>
                         <div class="points-to-lead">${salmonesPointsToLeadText}</div>
                    </div>
                    ${salmonesTeam.logo ? `<img src="${salmonesTeam.logo}" alt="${salmonesTeam.name} Logo" class="team-logo">` : ''}
                </div>
            </div>
            <div class="leaderboard-status">${leadingTeamText}</div>
            <div class="progress-bar-container">
                <div class="progress-bar"><div class="progress progress-tortugas" style="width: ${((tortugasScore / pointsNeededToWinTournament) * 100).toFixed(1)}%; background-color: ${tortugasTeam.color};"></div></div>
                <div class="progress-bar"><div class="progress progress-salmones" style="width: ${((salmonesScore / pointsNeededToWinTournament) * 100).toFixed(1)}%; background-color: ${salmonesTeam.color};"></div></div>
            </div>
            <a href="#" class="view-full-leaderboard" data-target-nav="leaderboard">Ver Clasificación Completa</a>
        </div>`;
    }

    function renderTeamsPage() {
        let html = '<div class="content-section"><h2>Equipos</h2><div class="teams-container">';
        for (const teamKey in appData.teams) {
            const team = appData.teams[teamKey] || defaultAppDataStructure.teams[teamKey];
            const playersArray = Array.isArray(team.players) ? team.players : [];
            let playersHtml = playersArray.map(player => `<li><div class="player-info-wrapper"><span class="player-initial" style="background-color: ${darkenColor(team.color, 20)};">${player.initials}</span><span class="player-name-list">${player.name} </span></div>${isAdmin ? `<button class="action-button delete compact" style="margin-left:auto; padding: 4px 8px; font-size: 0.75rem;" onclick="window.deletePlayerById('${player.id}', '${player.name}')"><i class="fas fa-times"></i></button>` : ''}</li>`).join('');
            
            const addAdminPlayerBtn = isAdmin ? `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dotted #ccc;">
                    <input type="text" id="newPlayerName_${team.id}" placeholder="Nombre" style="width:100%; padding: 5px; margin-bottom:5px; border-radius: 4px; border: 1px solid #ccc;">
                    <input type="text" id="newPlayerInitials_${team.id}" placeholder="Iniciales" style="width:100%; padding: 5px; margin-bottom:5px; border-radius: 4px; border: 1px solid #ccc;">
                    <button class="action-button add" style="width:100%;" onclick="window.addPlayerToTeam('${team.id}')"><i class="fas fa-user-plus"></i> Añadir Jugador</button>
                </div>
            ` : '';
            
            html += `<div class="team-column"><h3>${team.logo ? `<img src="${team.logo}" alt="${team.name} Logo" style="height: 30px; margin-right: 10px; border-radius: 4px;">` : ''}Equipo ${team.name}<span class="score-badge" style="background-color: ${team.color};">${(team.score || 0).toFixed(1)}</span></h3><p>MIEMBROS DEL EQUIPO (${playersArray.length})</p><ul class="team-members-list">${playersHtml}</ul>${addAdminPlayerBtn}</div>`;
        }
        html += '</div></div>'; return html;
    }

    function renderCreateMatchForm(roundId, roundFormat) {
        const tortugasTeam = appData.teams?.tortugas || defaultAppDataStructure.teams.tortugas;
        const salmonesTeam = appData.teams?.salmones || defaultAppDataStructure.teams.salmones;
        let maxPlayersPerTeam = 1;
        const formatLower = roundFormat.toLowerCase();
        if (formatLower.includes("fourball") || formatLower.includes("foursomes") || formatLower.includes("scramble") || formatLower.includes("mejor bola") || formatLower.includes("tiros alternos")) {
            maxPlayersPerTeam = 2;
        }

        const playerToOptions = (players) => {
            // MODIFICADO: No mostrar los puntos del jugador en el desplegable
            return Array.isArray(players) ? players.map(p => `<option value="${p.name}">${p.name}</option>`).join('') : '';
        };

        let tortugasPlayerSelectors = '';
        let salmonesPlayerSelectors = '';

        for (let i = 1; i <= maxPlayersPerTeam; i++) {
            tortugasPlayerSelectors += `
                <select id="newMatchTortugaPlayer${i}_${roundId}" class="new-match-player-select" data-team="tortugas">
                    <option value="">-- Jugador ${i} ${tortugasTeam.name} --</option>
                    ${playerToOptions(tortugasTeam.players)}
                </select>`;
            salmonesPlayerSelectors += `
                <select id="newMatchSalmonPlayer${i}_${roundId}" class="new-match-player-select" data-team="salmones">
                    <option value="">-- Jugador ${i} ${salmonesTeam.name} --</option>
                    ${playerToOptions(salmonesTeam.players)}
                </select>`;
        }

        return `
            <div class="create-new-match-form" data-round-id="${roundId}">
                <h4>Crear Nuevo Partido (Formato: ${roundFormat})</h4>
                <p>Selecciona ${maxPlayersPerTeam} jugador(es) para cada equipo:</p>
                <div class="match-player-selection">
                    <div class="team-player-selector">
                        <h5>${tortugasTeam.name}</h5>
                        ${tortugasPlayerSelectors}
                        ${(tortugasTeam.players || []).length === 0 ? '<p class="notice-text" style="color:red;">No hay jugadores disponibles para este equipo.</p>' : ''}
                    </div>
                    <div class="vs-divider-form">vs</div>
                    <div class="team-player-selector">
                        <h5>${salmonesTeam.name}</h5>
                        ${salmonesPlayerSelectors}
                        ${(salmonesTeam.players || []).length === 0 ? '<p class="notice-text" style="color:red;">No hay jugadores disponibles para este equipo.</p>' : ''}
                    </div>
                </div>
                <button class="create-match-submit-btn action-button add" data-round-id="${roundId}" data-max-players="${maxPlayersPerTeam}">
                    <i class="fas fa-plus-circle"></i> Crear Partido
                </button>
            </div>
        `;
    }

    function renderSingleMatch(match, roundId) {
        const tortugasTeam = appData.teams?.tortugas || defaultAppDataStructure.teams.tortugas;
        const salmonesTeam = appData.teams?.salmones || defaultAppDataStructure.teams.salmones;

        let tPlayersArray = Array.isArray(match.tortugas) ? match.tortugas : (match.tortugas ? [match.tortugas] : ['N/A']);
        let sPlayersArray = Array.isArray(match.salmones) ? match.salmones : (match.salmones ? [match.salmones] : ['N/A']);

        let tPlayersDisplay = tPlayersArray.join(' & ');
        let sPlayersDisplay = sPlayersArray.join(' & ');

        let winnerClass = '';
        if (match.winner === 'tortugas') winnerClass = 'match-winner-tortugas';
        else if (match.winner === 'salmones') winnerClass = 'match-winner-salmones';
        else if (match.winner === 'empate') winnerClass = 'match-winner-empate';

        const tortugasLabel = tPlayersArray[0] !== 'N/A' ? ` (${tortugasTeam.name})` : '';
        const salmonesLabel = sPlayersArray[0] !== 'N/A' ? ` (${salmonesTeam.name})` : '';

        const adminControls = isAdmin ? `
                    <div class="match-item-controls">
                        <label for="winner_${match.id}" class="sr-only">Ganador:</label>
                        <select class="match-winner-select" id="winner_${match.id}" data-round-id="${roundId}" data-match-id="${match.id}">
                            <option value="">-- Ganador --</option>
                            <option value="tortugas" ${match.winner === 'tortugas' ? 'selected' : ''}>${tortugasTeam.name}</option>
                            <option value="salmones" ${match.winner === 'salmones' ? 'selected' : ''}>${salmonesTeam.name}</option>
                            <option value="empate" ${match.winner === 'empate' ? 'selected' : ''}>Empate</option>
                        </select>
                        <button class="save-match-btn action-button edit compact" data-round-id="${roundId}" data-match-id="${match.id}" title="Guardar Partido"><i class="fas fa-save"></i></button>
                        <button class="remove-match-btn action-button delete compact" data-round-id="${roundId}" data-match-id="${match.id}" title="Eliminar Partido"><i class="fas fa-trash-alt"></i></button>
                    </div>` : `<div class="match-item-controls view-only-controls"><span style="font-weight:bold; font-size: 1.1rem; margin-right: 15px;">${match.winner ? (match.winner === 'tortugas' ? tortugasTeam.name : match.winner === 'salmones' ? salmonesTeam.name : 'Empate') : 'Pendiente'}</span></div>`;


        return `<div class="match-editor match-item ${winnerClass}" data-match-render-id="${match.id}">
                    <div class="match-item-players">
                        <span class="player-names tortugas-players" style="--player-text-color: ${tortugasTeam.color};">
                            ${tPlayersDisplay}
                            <span class="team-tag">${tortugasLabel}</span>
                        </span>
                        <span class="vs-text">vs</span>
                        <span class="player-names salmones-players" style="--player-text-color: ${salmonesTeam.color};">
                            ${sPlayersDisplay}
                            <span class="team-tag">${salmonesLabel}</span>
                        </span>
                    </div>
                    ${adminControls}
                </div>`;
    }

    function renderRoundsPage() {
        const tortugasTeam = appData.teams?.tortugas || defaultAppDataStructure.teams.tortugas;
        const salmonesTeam = appData.teams?.salmones || defaultAppDataStructure.teams.salmones;

        const roundStatusText = (status) => {
            if (!status) return 'Pendiente';
            switch (status.toLowerCase()) {
                case 'scheduled': return 'Programada';
                case 'in-progress': return 'En Progreso';
                case 'completed': return 'Completada';
                default: return status; 
            }
        };
        const roundStatusClass = (status) => {
             if (!status) return 'pendiente';
             return status.toLowerCase().replace(/\s+/g, '-');
        }

        let roundsHtml = (appData.rounds || []).map(round => {
            const matchesArray = Array.isArray(round.matches) ? round.matches : [];
            let matchesHtml = matchesArray.map(match => renderSingleMatch(match, round.id)).join('');

            const rScores = round.scores || { tortugas: 0, salmones: 0 };
            const totalPts = rScores.tortugas + rScores.salmones;
            const tPerc = totalPts > 0 ? (rScores.tortugas / totalPts) * 100 : (rScores.tortugas > 0 ? 100 :0);
            const sPerc = totalPts > 0 ? (rScores.salmones / totalPts) * 100 : (rScores.salmones > 0 ? 100 :0);
            
            let formContentHtml = '';
            if (appData.teams?.tortugas?.players?.length > 0 && appData.teams?.salmones?.players?.length > 0) {
                formContentHtml = renderCreateMatchForm(round.id, round.format);
            } else {
                 formContentHtml = '<p class="notice-text">No se pueden crear partidos hasta que ambos equipos tengan jugadores asignados.</p>';
            }

            const addMatchSectionHtml = isAdmin ? `
                <div class="add-match-section" data-round-id-form="${round.id}">
                    <div class="add-match-header">
                        <h5><i class="fas fa-plus-circle"></i> Crear Nuevo Partido</h5>
                        <span class="toggle-form-arrow"><i class="fas fa-chevron-down"></i></span>
                    </div>
                    <div class="add-match-form-container hidden">
                        ${formContentHtml}
                    </div>
                </div>` : '';
            
            const formattedDate = new Date((round.date || '1970-01-01') + 'T00:00:00Z').toLocaleDateString('es-ES', {
                day: '2-digit', month: 'short',
            });

            return `<div class="round" data-round-id="${round.id}">
                        <div class="round-header">
                            <div class="round-header-main">
                                <div class="round-title-status-group">
                                    <h4>${round.name} (${round.format || 'Formato no especificado'})</h4>
                                    <span class="round-status status-${roundStatusClass(round.status)}">${roundStatusText(round.status)}</span>
                                </div>
                                <div class="round-header-info-details">
                                    ${round.course ? `<span class="header-detail course-detail"><i class="fas fa-map-marker-alt"></i> ${round.course}</span>` : ''}
                                    <span class="header-detail date-detail"><i class="fas fa-calendar-alt"></i> ${formattedDate}</span>
                                    ${round.time ? `<span class="header-detail time-detail"><i class="fas fa-clock"></i> ${round.time}</span>` : ''}
                                </div>
                            </div>
                            ${isAdmin ? `
                                <button class="action-button edit compact" style="margin-left:8px; padding:6px 10px; flex-shrink:0;" onclick="event.stopPropagation(); window.openEditRoundModal('${round.id}')" title="Editar Ronda"><i class="fas fa-edit"></i></button>
                                <button class="action-button delete compact" style="margin-left:8px; padding:6px 10px; flex-shrink:0;" onclick="event.stopPropagation(); window.deleteRound('${round.id}', '${round.name.replace(/'/g,"\\'")}',${ matchesArray.length })" title="Eliminar Ronda"><i class="fas fa-trash"></i></button>
                            ` : ''}
                            <span class="toggle-arrow"><i class="fas fa-chevron-down"></i></span>
                        </div>
                        <div class="round-details hidden"> 
                            <div class="round-scoring">
                                <span class="score-display tortugas-score-display" data-round-id-score-tortugas="${round.id}" style="color: ${tortugasTeam.color};">${rScores.tortugas.toFixed(1)}</span>
                                <div class="round-score-bar">
                                    <div class="round-score-tortugas" data-round-score-tortugas-bar="${round.id}" style="width: ${tPerc.toFixed(1)}%; background-color: ${tortugasTeam.color};"></div>
                                    <div class="round-score-salmones" data-round-score-salmones-bar="${round.id}" style="width: ${sPerc.toFixed(1)}%; background-color: ${salmonesTeam.color};"></div>
                                </div>
                                <span class="score-display salmones-score-display" data-round-id-score-salmones="${round.id}" style="color: ${salmonesTeam.color};">${rScores.salmones.toFixed(1)}</span>
                            </div>
                            <div class="matches-section-for-day">
                                <h5>Partidos del Día (${matchesArray.length}):</h5>
                                <div class="matches-list-container">
                                    ${matchesHtml || '<p class="notice-text">Aún no hay partidos definidos para esta ronda.</p>'}
                                </div>
                            </div>
                            ${addMatchSectionHtml} 
                        </div>
                    </div>`;
        }).join('');

        const adminAddRoundBtn = isAdmin ? `
            <div style="margin-top:28px; text-align:center; padding: 20px 0; border-top: 1px dashed #e0e0e0;">
                <button onclick="window.promptCreateRound()" style="
                    display: inline-flex;
                    align-items: center;
                    gap: 10px;
                    padding: 12px 28px;
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    color: #D4AF37;
                    border: 1px solid #D4AF37;
                    border-radius: 8px;
                    font-size: 0.95rem;
                    font-weight: 700;
                    letter-spacing: 0.05em;
                    cursor: pointer;
                    transition: all 0.25s ease;
                    box-shadow: 0 2px 12px rgba(212,175,55,0.15);
                    font-family: inherit;
                " onmouseover="this.style.background='linear-gradient(135deg,#D4AF37,#f3ca4d)'; this.style.color='#1a1200'; this.style.boxShadow='0 6px 24px rgba(212,175,55,0.4)';"
                   onmouseout="this.style.background='linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'; this.style.color='#D4AF37'; this.style.boxShadow='0 2px 12px rgba(212,175,55,0.15)';">
                    <i class="fas fa-plus-circle"></i>
                    Nueva Jornada / Ronda
                </button>
            </div>
        ` : '';

        return `<div class="content-section"><h2><i class="fas fa-flag-checkered"></i> Rondas del Torneo</h2>${roundsHtml}${adminAddRoundBtn}</div>`;
    }
    
    function renderLeaderboardPage(filter = 'overall') {
        const tortugasTeam = appData.teams?.tortugas || defaultAppDataStructure.teams.tortugas;
        const salmonesTeam = appData.teams?.salmones || defaultAppDataStructure.teams.salmones;
        const tortugasScore = tortugasTeam.score || 0;
        const salmonesScore = salmonesTeam.score || 0;
        const pointsNeededToWinTournament = appData.pointsNeededToWin || defaultAppDataStructure.pointsNeededToWin;

        let leadingTeamText = "";
        let tortugasPointsToLeadText = "";
        let salmonesPointsToLeadText = "";

        if (tortugasScore > salmonesScore) {
            leadingTeamText = `${tortugasTeam.name.toUpperCase()} LIDERANDO`;
            const diff = tortugasScore - salmonesScore;
            salmonesPointsToLeadText = `${(diff + 0.5).toFixed(1)} pts para superar`;
            tortugasPointsToLeadText = `Lidera por ${diff.toFixed(1)} pts`;
        } else if (salmonesScore > tortugasScore) {
            leadingTeamText = `${salmonesTeam.name.toUpperCase()} LIDERANDO`;
            const diff = salmonesScore - tortugasScore;
            tortugasPointsToLeadText = `${(diff + 0.5).toFixed(1)} pts para superar`;
            salmonesPointsToLeadText = `Lidera por ${diff.toFixed(1)} pts`;
        } else if (tortugasScore === salmonesScore && (tortugasScore > 0 || salmonesScore > 0)) {
            leadingTeamText = "EMPATE";
            tortugasPointsToLeadText = `0.5 pts para liderar`;
            salmonesPointsToLeadText = `0.5 pts para liderar`;
        } else {
            leadingTeamText = "SIN PUNTOS REGISTRADOS";
            tortugasPointsToLeadText = ``;
            salmonesPointsToLeadText = ``;
        }
        
        if (tortugasScore >= pointsNeededToWinTournament && tortugasScore > salmonesScore) {
            leadingTeamText = `¡${tortugasTeam.name.toUpperCase()} HA GANADO EL TORNEO!`;
            tortugasPointsToLeadText = "Campeón"; salmonesPointsToLeadText = "-";
        } else if (salmonesScore >= pointsNeededToWinTournament && salmonesScore > tortugasScore) {
            leadingTeamText = `¡${salmonesTeam.name.toUpperCase()} HA GANADO EL TORNEO!`;
            salmonesPointsToLeadText = "Campeón"; tortugasPointsToLeadText = "-";
        } else if (tortugasScore >= pointsNeededToWinTournament && salmonesScore >= pointsNeededToWinTournament && tortugasScore === salmonesScore){
             leadingTeamText = `¡EMPATE EN EL TORNEO!`;
             tortugasPointsToLeadText = "Empate Torneo"; salmonesPointsToLeadText = "Empate Torneo";
        }
        
        const tortugasPlayers = Array.isArray(tortugasTeam.players) ? tortugasTeam.players : [];
        const salmonesPlayers = Array.isArray(salmonesTeam.players) ? salmonesTeam.players : [];
        
        let allPlayers = [
            ...tortugasPlayers.map(p => ({ ...p, teamKey: 'tortugas', teamName: tortugasTeam.name, color: tortugasTeam.color, logo: tortugasTeam.logo })),
            ...salmonesPlayers.map(p => ({ ...p, teamKey: 'salmones', teamName: salmonesTeam.name, color: salmonesTeam.color, logo: salmonesTeam.logo }))
        ];
        allPlayers.sort((a, b) => (b.points || 0) - (a.points || 0)); 
        
        let filteredPlayers = allPlayers;
        if (filter === 'team_tortugas') filteredPlayers = allPlayers.filter(p => p.teamKey === 'tortugas');
        else if (filter === 'team_salmones') filteredPlayers = allPlayers.filter(p => p.teamKey === 'salmones');
        
        const maxPointsEver = Math.max(...allPlayers.map(p => p.points || 0), 0.5);
        let playerStatsHtml = filteredPlayers.map(player => {
            const pPts = player.points || 0;
            const barPerc = maxPointsEver > 0 ? (pPts / maxPointsEver) * 100 : 0;
            return `<div class="player-stat-bar ${player.teamKey}-stat-bar">
                        <span class="player-name">${player.logo ? `<img src="${player.logo}" alt="${player.teamName}" class="player-logo-stat">` : ''}${player.name}</span>
                        <div class="stat-bar-container">
                            <div class="stat-bar" style="width: ${barPerc.toFixed(1)}%; background-color: ${player.color};">${pPts > 0 ? pPts.toFixed(1) : ''}</div>
                        </div>
                        <span class="player-points">${pPts.toFixed(1)} pts</span>
                    </div>`;
        }).join('');

        return `<div class="content-section">
            <div class="standings-header"><h1>Clasificación General</h1></div>
            <div class="scoreboard">
                <div class="team-score team-tortugas" style="background-color: ${tortugasTeam.color};">
                    ${tortugasTeam.logo ? `<img src="${tortugasTeam.logo}" alt="${tortugasTeam.name} Logo" class="team-logo">` : ''}
                    <div class="team-info">
                        <div class="team-name">${tortugasTeam.name.toUpperCase()}</div>
                        <div class="points-to-lead">${tortugasPointsToLeadText}</div>
                    </div>
                    <div class="score">${tortugasScore.toFixed(1)}</div>
                </div>
                <div class="vs">VS</div>
                <div class="team-score team-salmones" style="background-color: ${salmonesTeam.color};">
                    <div class="score">${salmonesScore.toFixed(1)}</div>
                    <div class="team-info">
                        <div class="team-name">${salmonesTeam.name.toUpperCase()}</div>
                        <div class="points-to-lead">${salmonesPointsToLeadText}</div>
                    </div>
                    ${salmonesTeam.logo ? `<img src="${salmonesTeam.logo}" alt="${salmonesTeam.name} Logo" class="team-logo">` : ''}
                </div>
            </div>
            <div class="leaderboard-status">${leadingTeamText}</div>
            <div class="progress-bar-container">
                <div class="progress-bar"><div class="progress progress-tortugas" style="width: ${((tortugasScore / pointsNeededToWinTournament) * 100).toFixed(1)}%; background-color: ${tortugasTeam.color};"></div></div>
                <div class="progress-bar"><div class="progress progress-salmones" style="width: ${((salmonesScore / pointsNeededToWinTournament) * 100).toFixed(1)}%; background-color: ${salmonesTeam.color};"></div></div>
            </div>
        </div>
        <div class="content-section">
            <div class="player-stats-header"><h3>Estadísticas Individuales de Jugadores</h3></div>
            <div class="player-stats-filters">
                <button class="${filter === 'overall' ? 'active' : ''}" data-filter="overall">General</button>
                <button class="${filter === 'team_tortugas' ? 'active' : ''}" data-filter="team_tortugas" style="border-color: ${tortugasTeam.color}; color: ${filter === 'team_tortugas' ? '#fff' : tortugasTeam.color}; background-color: ${filter === 'team_tortugas' ? tortugasTeam.color : 'transparent'};">${tortugasTeam.name}</button>
                <button class="${filter === 'team_salmones' ? 'active' : ''}" data-filter="team_salmones" style="border-color: ${salmonesTeam.color}; color: ${filter === 'team_salmones' ? '#fff' : salmonesTeam.color}; background-color: ${filter === 'team_salmones' ? salmonesTeam.color : 'transparent'};">${salmonesTeam.name}</button>
            </div>
            ${playerStatsHtml || '<p class="notice-text">No hay estadísticas individuales disponibles.</p>'}
        </div>`;
    }

    function renderInfoPage() {
        const tInfo = appData.tournamentInfo || defaultAppDataStructure.tournamentInfo;
        const aDetails = appData.additionalDetails || defaultAppDataStructure.additionalDetails;
        // Asegúrate de que estos campos existen en tu base de datos (tabla tournament_config, columna tournament_info)
        // o proporciona valores por defecto más explícitos aquí.
        const nuevaInfoEjemplo = {
            mainSponsor: tInfo.mainSponsor || "Patrocinador Principal (por definir)",
            weatherContingency: tInfo.weatherContingency || "En caso de lluvia severa, se consultará con los capitanes.",
            contact: tInfo.contact || "organizacion@ejemplo.com",
            dressCode: tInfo.dressCode || "Etiqueta de Golf Estándar."
        };
        let schedHtml = Array.isArray(aDetails.schedule) ? aDetails.schedule.map(dS => `<h4>${dS.day}</h4><ul>${dS.items.map(i => `<li>${i}</li>`).join('')}</ul>`).join('') : '<p class="notice-text">Horarios detallados no disponibles.</p>';
        
        return `<div class="content-section"><h2><i class="fas fa-info-circle"></i> Información del Torneo</h2>
            <div class="tournament-info-grid">
                <div class="info-card"><h4><i class="fas fa-map-marker-alt"></i> Ubicación</h4><p>${tInfo.locationName || 'N/A'}</p><p>${tInfo.locationAddress || ''}</p></div>
                <div class="info-card"><h4><i class="fas fa-globe"></i> Sitio Web</h4><p><a href="${tInfo.venueWebsite || '#'}" target="_blank" rel="noopener noreferrer">Visitar <i class="fas fa-external-link-alt"></i></a></p></div>
                <div class="info-card"><h4><i class="fas fa-cloud-rain"></i> Contingencia Climática</h4><p>${nuevaInfoEjemplo.weatherContingency}</p></div>
                <div class="info-card"><h4><i class="fas fa-tshirt"></i> Código de Vestimenta</h4><p>${nuevaInfoEjemplo.dressCode}</p></div>
            </div>
        </div>
        <div class="content-section additional-details"><h3><i class="fas fa-clipboard-list"></i> Horarios Detallados</h3>
            <div class="schedule">${schedHtml}</div>
        </div>`;
    }

    function renderRulesPage() {
        const rules = Array.isArray(appData.rules) && appData.rules.length > 0 ? appData.rules : defaultAppDataStructure.rules;
        const tName = appData.tournamentName || defaultAppDataStructure.tournamentName;
        let rulesHtml = rules.map(rule => `<li>${rule}</li>`).join('');
        return `<div class="content-section rules-page"><h2><i class="fas fa-gavel"></i> Reglas del Torneo</h2><div class="rules-content"><p>Bienvenido a la ${tName}. Reglas principales:</p><ul>${rulesHtml}</ul><p style="margin-top:15px;">Se espera deportividad y etiqueta de golf de todos los participantes.</p></div></div>`;
    }

    function updateProgressBars() {
        const tTeam = appData.teams?.tortugas || defaultAppDataStructure.teams.tortugas;
        const sTeam = appData.teams?.salmones || defaultAppDataStructure.teams.salmones;
        const tScore = tTeam.score || 0;
        const sScore = sTeam.score || 0;
        const ptsNeeded = appData.pointsNeededToWin || 1;

        const tProg = Math.min((tScore / ptsNeeded) * 100, 100);
        const sProg = Math.min((sScore / ptsNeeded) * 100, 100);

        const tBarElements = document.querySelectorAll('.progress-tortugas');
        const sBarElements = document.querySelectorAll('.progress-salmones');

        tBarElements.forEach(tBar => {
            if (tBar) {
                tBar.style.width = `${tProg.toFixed(1)}%`;
                tBar.textContent = `${tScore.toFixed(1)} pts`;
            }
        });
        sBarElements.forEach(sBar => {
            if (sBar) {
                sBar.style.width = `${sProg.toFixed(1)}%`;
                sBar.textContent = `${sScore.toFixed(1)} pts`;
            }
        });
    }

    function updateRoundScoreInDOM(roundId, tortugasRoundScore, salmonesRoundScore) {
        const tortugasScoreDisplay = document.querySelector(`.tortugas-score-display[data-round-id-score-tortugas="${roundId}"]`);
        const salmonesScoreDisplay = document.querySelector(`.salmones-score-display[data-round-id-score-salmones="${roundId}"]`);
        const tortugasBar = document.querySelector(`.round-score-tortugas[data-round-score-tortugas-bar="${roundId}"]`);
        const salmonesBar = document.querySelector(`.round-score-salmones[data-round-score-salmones-bar="${roundId}"]`);

        if (tortugasScoreDisplay) tortugasScoreDisplay.textContent = tortugasRoundScore.toFixed(1);
        if (salmonesScoreDisplay) salmonesScoreDisplay.textContent = salmonesRoundScore.toFixed(1);

        if (tortugasBar && salmonesBar) {
            const totalRoundPoints = tortugasRoundScore + salmonesRoundScore;
            let tPerc = 0;
            let sPerc = 0;

            if (totalRoundPoints > 0) {
                tPerc = (tortugasRoundScore / totalRoundPoints) * 100;
                sPerc = (salmonesRoundScore / totalRoundPoints) * 100;
            } else if (tortugasRoundScore > 0) {
                tPerc = 100;
            } else if (salmonesRoundScore > 0) {
                sPerc = 100;
            }
            
            tortugasBar.style.width = `${tPerc.toFixed(1)}%`;
            salmonesBar.style.width = `${sPerc.toFixed(1)}%`;
        }
        updateProgressBars();
    }

    function updatePlayerSelectOptionsInForms(specificRoundId = null) {
        const tortugasTeam = appData.teams?.tortugas || defaultAppDataStructure.teams.tortugas;
        const salmonesTeam = appData.teams?.salmones || defaultAppDataStructure.teams.salmones;
    
        const generateOptionsHtml = (players) => {
            return Array.isArray(players) ? players.map(p => {
                // Usamos player.points que fue actualizado en calculateAndSyncScores
                const totalPoints = p.points !== undefined ? p.points.toFixed(1) : '0.0';
                return `<option value="${p.name}">${p.name} (Total Torneo: ${totalPoints})</option>`;
            }).join('') : '';
        };
    
        const tortugasOptionsHtml = generateOptionsHtml(tortugasTeam.players);
        const salmonesOptionsHtml = generateOptionsHtml(salmonesTeam.players);
    
        const formsToUpdateSelector = specificRoundId 
            ? `.create-new-match-form[data-round-id="${specificRoundId}"]` 
            : '.create-new-match-form';
        
        document.querySelectorAll(formsToUpdateSelector).forEach(form => {
            if (!form || form.closest('.add-match-form-container.hidden')) return; 
    
            const currentRoundId = form.dataset.roundId;
            const createBtn = form.querySelector('.create-match-submit-btn');
            if (!createBtn) return;
            const maxPlayers = parseInt(createBtn.dataset.maxPlayers || '1');
    
            for (let i = 1; i <= maxPlayers; i++) {
                const tortugaSelect = form.querySelector(`#newMatchTortugaPlayer${i}_${currentRoundId}`);
                const salmonSelect = form.querySelector(`#newMatchSalmonPlayer${i}_${currentRoundId}`);
    
                if (tortugaSelect) {
                    const currentValue = tortugaSelect.value; 
                    tortugaSelect.innerHTML = `<option value="">-- Jugador ${i} ${tortugasTeam.name} --</option>${tortugasOptionsHtml}`;
                    if (Array.from(tortugaSelect.options).some(opt => opt.value === currentValue)) {
                       tortugaSelect.value = currentValue;
                    } else {
                       tortugaSelect.value = ""; 
                    }
                }
                if (salmonSelect) {
                    const currentValue = salmonSelect.value;
                    salmonSelect.innerHTML = `<option value="">-- Jugador ${i} ${salmonesTeam.name} --</option>${salmonesOptionsHtml}`;
                     if (Array.from(salmonSelect.options).some(opt => opt.value === currentValue)) {
                        salmonSelect.value = currentValue;
                    } else {
                        salmonSelect.value = "";
                    }
                }
            }
        });
        console.log("Opciones de selector de jugadores actualizadas en formularios (si están visibles).");
    }


    function attachListenersToMatchItem(matchItemElement) {
        const saveBtn = matchItemElement.querySelector('.save-match-btn');
        const removeBtn = matchItemElement.querySelector('.remove-match-btn');
    
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const rId = parseInt(saveBtn.dataset.roundId); 
                const mIdAttr = saveBtn.dataset.matchId; 
                const mId = /^\d+$/.test(mIdAttr) ? parseInt(mIdAttr) : mIdAttr;
                const matchEditorDiv = saveBtn.closest('.match-item');
                const winnerEl = matchEditorDiv.querySelector(`#winner_${mIdAttr}`);
                const resultEl = matchEditorDiv.querySelector(`#result_${mIdAttr}`);
                
                if (!winnerEl || !resultEl) { console.error("Elementos DOM no encontrados para guardar partido (adjunto dinámicamente)"); return; }

                const winner = winnerEl.value || null;
                const result = resultEl.value.trim() || null;

                const originalButtonText = saveBtn.innerHTML;
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

                 try {
                    const { error } = await supabaseClient.from('matches').update({ winner, result }).eq('id', mId);
                    if (error) throw error;

                    const rApp = appData.rounds.find(r => r.id === rId);
                    if (rApp?.matches) {
                        const mApp = rApp.matches.find(m => m.id == mId);
                        if (mApp) { mApp.winner = winner; mApp.result = result; }
                    }
                    await calculateAndSyncScores();
                    
                    matchEditorDiv.classList.remove('match-winner-tortugas', 'match-winner-salmones', 'match-winner-empate');
                    if (winner === 'tortugas') matchEditorDiv.classList.add('match-winner-tortugas');
                    else if (winner === 'salmones') matchEditorDiv.classList.add('match-winner-salmones');
                    else if (winner === 'empate') matchEditorDiv.classList.add('match-winner-empate');
                    
                    const roundDataForScores = appData.rounds.find(r => r.id === rId);
                    if (roundDataForScores && roundDataForScores.scores) {
                        updateRoundScoreInDOM(rId, roundDataForScores.scores.tortugas, roundDataForScores.scores.salmones);
                    }
                    updatePlayerSelectOptionsInForms(rId); 

                } catch (err) { 
                    console.error("Error guardando partido (adjunto dinámicamente):", err);
                    alert("Error al guardar el partido: " + err.message);
                } finally {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = originalButtonText;
                }
            });
        }
    
        if (removeBtn) {
            removeBtn.addEventListener('click', async () => {
                const rId = parseInt(removeBtn.dataset.roundId);
                const mIdAttr = removeBtn.dataset.matchId;
                const mId = /^\d+$/.test(mIdAttr) ? parseInt(mIdAttr) : mIdAttr;
                const matchEditorDiv = removeBtn.closest('.match-item');
    
                if (confirm("¿Estás seguro de que quieres eliminar este partido?")) {
                    const originalButtonText = removeBtn.innerHTML;
                    removeBtn.disabled = true;
                    removeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Eliminando...';
                     try {
                        const { error } = await supabaseClient.from('matches').delete().eq('id', mId);
                        if (error) throw error;

                        const rApp = appData.rounds.find(r => r.id === rId);
                        if (rApp?.matches) rApp.matches = rApp.matches.filter(m => m.id != mId);
                        
                        await calculateAndSyncScores();

                        if (matchEditorDiv) matchEditorDiv.remove();
                        
                        const roundElement = document.querySelector(`.round[data-round-id="${rId}"]`);
                        if(roundElement && rApp){
                            const matchesHeader = roundElement.querySelector('.matches-section-for-day h5');
                            if(matchesHeader) matchesHeader.textContent = `Partidos del Día (${rApp.matches.length}):`;
                        }
    
                        const roundDataForScores = appData.rounds.find(r => r.id === rId);
                        if (roundDataForScores && roundDataForScores.scores) {
                           updateRoundScoreInDOM(rId, roundDataForScores.scores.tortugas, roundDataForScores.scores.salmones);
                        }
                        updatePlayerSelectOptionsInForms(rId);

                    } catch (err) { 
                        console.error("Error eliminando partido (adjunto dinámicamente):", err);
                        alert("Error al eliminar el partido: " + err.message);
                        if(document.body.contains(removeBtn)) {
                           removeBtn.disabled = false;
                           removeBtn.innerHTML = originalButtonText;
                        }
                    }
                }
            });
        }
    }
    
    function addEventListenersToDynamicContent(currentPage) {
        if (currentPage === 'home' || !currentPage) {
            const btn = contentArea.querySelector('.view-full-leaderboard');
            if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); document.querySelector(`.sidebar nav ul li[data-target="${btn.dataset.targetNav}"]`)?.click(); });
        }
        
        if (currentPage === 'rounds') {
            contentArea.querySelectorAll('.round-header').forEach(h => {
                h.addEventListener('click', () => { 
                    const details = h.nextElementSibling;
                    if (details) {
                        details.classList.toggle('hidden');
                        const arrowIcon = h.querySelector('.toggle-arrow i');
                        if (arrowIcon) { 
                            arrowIcon.classList.toggle('fa-chevron-down'); 
                            arrowIcon.classList.toggle('fa-chevron-up');
                        }
                    }
                });
            });

            contentArea.querySelectorAll('.add-match-header').forEach(header => {
                header.addEventListener('click', () => {
                    const formContainer = header.nextElementSibling;
                    const arrowIcon = header.querySelector('.toggle-form-arrow i');
                    if (formContainer) {
                        formContainer.classList.toggle('hidden');
                        header.classList.toggle('form-open');
                        arrowIcon?.classList.toggle('fa-chevron-down');
                        arrowIcon?.classList.toggle('fa-chevron-up');
                    }
                });
            });

            contentArea.querySelectorAll('.match-item').forEach(matchItemElement => {
                attachListenersToMatchItem(matchItemElement);
            });
            
            contentArea.querySelectorAll('.create-match-submit-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const roundId = parseInt(btn.dataset.roundId);
                    const formElement = btn.closest('.create-new-match-form');
                    const currentRound = appData.rounds.find(r => r.id === roundId);
                    if (!currentRound) { alert("Error: No se pudo encontrar la ronda."); return; }

                    const maxPlayers = parseInt(btn.dataset.maxPlayers);
                    const tortugasPlayersSelected = [];
                    const salmonesPlayersSelected = [];

                    for (let i = 1; i <= maxPlayers; i++) {
                        const tortugaSelect = formElement.querySelector(`#newMatchTortugaPlayer${i}_${roundId}`);
                        const salmonSelect = formElement.querySelector(`#newMatchSalmonPlayer${i}_${roundId}`);
                        if (tortugaSelect && tortugaSelect.value) tortugasPlayersSelected.push(tortugaSelect.value);
                        if (salmonSelect && salmonSelect.value) salmonesPlayersSelected.push(salmonSelect.value);
                    }

                    if (currentRound.format.toLowerCase() !== "individuales") {
                        if (tortugasPlayersSelected.length !== maxPlayers || salmonesPlayersSelected.length !== maxPlayers) {
                            alert(`Para el formato ${currentRound.format}, debes seleccionar ${maxPlayers} jugadores por cada equipo.`); return;
                        }
                    } else {
                        if (tortugasPlayersSelected.length === 0 || salmonesPlayersSelected.length === 0) {
                            alert("Debes seleccionar un jugador para cada equipo en formato Individual."); return;
                        }
                        if (tortugasPlayersSelected.length > maxPlayers || salmonesPlayersSelected.length > maxPlayers) {
                            alert(`Solo puedes seleccionar ${maxPlayers} jugador por equipo para el formato Individual.`); return;
                        }
                    }
                    if (new Set(tortugasPlayersSelected).size !== tortugasPlayersSelected.length) {
                        alert("Un jugador del equipo Tortugas ha sido seleccionado más de una vez."); return;
                    }
                    if (new Set(salmonesPlayersSelected).size !== salmonesPlayersSelected.length) {
                        alert("Un jugador del equipo Salmones ha sido seleccionado más de una vez."); return;
                    }
                    const allSelectedInMatch = [...tortugasPlayersSelected, ...salmonesPlayersSelected];
                    if (new Set(allSelectedInMatch).size !== allSelectedInMatch.length) {
                        const commonPlayersInMatch = tortugasPlayersSelected.filter(p => salmonesPlayersSelected.includes(p));
                        if(commonPlayersInMatch.length > 0){
                           alert(`El jugador ${commonPlayersInMatch.join(', ')} no puede estar en ambos equipos al mismo tiempo.`); return;
                        }
                    }

                    const matchData = { round_id: roundId, tortugas_players: tortugasPlayersSelected, salmones_players: salmonesPlayersSelected, result: null, winner: null };
                    const originalButtonText = btn.innerHTML;
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';

                    try {
                        const { data: newMatchFromDb, error } = await supabaseClient.from('matches').insert(matchData).select().single();
                        if (error) throw error;

                        const rApp = appData.rounds.find(r => r.id === roundId);
                        const newMatchForAppData = {
                            id: newMatchFromDb.id,
                            tortugas: newMatchFromDb.tortugas_players,
                            salmones: newMatchFromDb.salmones_players,
                            result: newMatchFromDb.result,
                            winner: newMatchFromDb.winner
                        };
                        if (rApp) {
                            if (!Array.isArray(rApp.matches)) { rApp.matches = []; }
                            rApp.matches.push(newMatchForAppData);
                        }
                        
                        await calculateAndSyncScores();

                        const newMatchHtml = renderSingleMatch(newMatchForAppData, rApp.id);
                        // Ajustar selector para el contenedor de partidos. Asumiendo que .add-match-section es hermano de .matches-section-for-day
                        const roundDetailsDiv = formElement.closest('.round-details');
                        const matchesListContainer = roundDetailsDiv.querySelector('.matches-list-container');
                        
                        const noticeText = matchesListContainer.querySelector('.notice-text');
                        if(noticeText) { 
                            noticeText.remove();
                        }
                        matchesListContainer.insertAdjacentHTML('beforeend', newMatchHtml);
                        
                        const newMatchElement = matchesListContainer.lastElementChild;
                        if (newMatchElement) {
                            attachListenersToMatchItem(newMatchElement);
                        }
                        
                        const roundElement = formElement.closest('.round');
                        if(roundElement && rApp){
                            const matchesHeader = roundElement.querySelector('.matches-section-for-day h5');
                            if(matchesHeader) matchesHeader.textContent = `Partidos del Día (${rApp.matches.length}):`;
                        }

                        formElement.querySelectorAll('select').forEach(select => select.selectedIndex = 0);
                        
                        const roundDataForScores = appData.rounds.find(r => r.id === roundId);
                         if (roundDataForScores && roundDataForScores.scores) {
                               updateRoundScoreInDOM(roundId, roundDataForScores.scores.tortugas, roundDataForScores.scores.salmones);
                         }
                        updatePlayerSelectOptionsInForms(roundId);

                        const addMatchSection = formElement.closest('.add-match-section');
                        if (addMatchSection) {
                            const addMatchFormContainer = addMatchSection.querySelector('.add-match-form-container');
                            const addMatchHeader = addMatchSection.querySelector('.add-match-header');
                            const arrowIcon = addMatchHeader?.querySelector('.toggle-form-arrow i');

                            if (addMatchFormContainer && !addMatchFormContainer.classList.contains('hidden')) {
                                addMatchFormContainer.classList.add('hidden');
                                addMatchHeader?.classList.remove('form-open');
                                if (arrowIcon) {
                                    arrowIcon.classList.remove('fa-chevron-up');
                                    arrowIcon.classList.add('fa-chevron-down');
                                }
                            }
                        }
                    } catch (err) {
                        console.error("Error añadiendo partido:", err);
                        alert("Error al crear el nuevo partido: " + err.message);
                    } finally {
                        btn.disabled = false;
                        btn.innerHTML = originalButtonText;
                    }
                });
            });
        }
        if (currentPage === 'leaderboard') {
            contentArea.querySelectorAll('.player-stats-filters button').forEach(b => b.addEventListener('click', () => renderContent('leaderboard', b.dataset.filter)));
        }
    }

    function renderContent(target, filterArg) {
        console.log(`Renderizando contenido para: ${target || 'home'}`);
        contentArea.innerHTML = '<div class="loading-spinner-container"><div class="loading-spinner"></div><p>Cargando...</p></div>';
        
        setTimeout(async () => { // Hacer la función interna async para esperar calculateAndSyncScores si es necesario
            let html = '<div>Contenido no disponible o error en renderizado.</div>';
            try {
                // Asegurarse que los datos de los jugadores (puntos) estén actualizados antes de renderizar vistas que los usan
                // await calculateAndSyncScores(); // Podría ser necesario si otras vistas también necesitan puntos actualizados al instante

                if (target === 'home' || !target) { html = renderHomePage(); }
                else if (target === 'teams') { html = renderTeamsPage(); }
                else if (target === 'rounds') { html = renderRoundsPage(); }
                else if (target === 'leaderboard') { html = renderLeaderboardPage(filterArg); }
                else if (target === 'info') { html = renderInfoPage(); }
                else if (target === 'rules') { html = renderRulesPage(); }
            } catch (renderError) {
                console.error(`Error renderizando la sección ${target}:`, renderError);
                html = `<div class="error-message">Error al renderizar la sección: ${renderError.message}. Por favor, revisa la consola.</div>`;
            }
            contentArea.innerHTML = html;
            addEventListenersToDynamicContent(target);
            updateProgressBars();
            // Si la página actual es 'rounds', también refrescar los selectores de jugadores
            if (target === 'rounds') {
                document.querySelectorAll('.add-match-section').forEach(section => {
                    const roundId = section.dataset.roundIdForm;
                    if (roundId) {
                        updatePlayerSelectOptionsInForms(roundId);
                    }
                });
            }
        }, 50);
    }

    // ========================================================
    // Lógica CRUD Admin Global
    // ========================================================
    window.promptCreateRound = () => {
        const modal = document.getElementById('createRoundModal');
        if (modal) {
            document.getElementById('roundDateInput').value = new Date().toISOString().split('T')[0];
            document.getElementById('roundNameInput').value = '';
            document.getElementById('roundFormatInput').value = '';
            document.getElementById('roundTimeInput').value = '';
            document.getElementById('roundCourseInput').value = appData.location || '';
            document.getElementById('roundStatusInput').value = 'scheduled';
            document.getElementById('roundErrorMsg').style.display = 'none';
            modal.classList.remove('hidden');
        }
    };

    window.addPlayerToTeam = async (teamId) => {
         const name = document.getElementById('newPlayerName_'+teamId).value;
         const initials = document.getElementById('newPlayerInitials_'+teamId).value;
         if(!name || !initials) { alert("Completa nombre e iniciales."); return; }
         try {
             const { data, error } = await supabaseClient.from('players').insert([{name, initials, team_id: teamId}]).select().single();
             if(error) throw error;
             window.location.reload();
         } catch(e) {
              alert("Error añadiendo jugador: " + e.message);
         }
    };

    window.deletePlayerById = async (playerId, playerName) => {
        if(!confirm(`¿Seguro que deseas eliminar a ${playerName}?`)) return;
        try {
            const { error } = await supabaseClient.from('players').delete().eq('id', playerId);
            if(error) throw error;
            window.location.reload();
        } catch(e) {
            alert("Error eliminando jugador: " + e.message);
        }
    };

    window.deleteRound = async (roundId, roundName, matchCount) => {
        if (matchCount > 0) {
            alert(`⚠️ No puedes eliminar "${roundName}" porque tiene ${matchCount} partido${matchCount > 1 ? 's' : ''} creado${matchCount > 1 ? 's' : ''}.\n\nElimina primero todos los partidos de esta ronda y luego podrás borrarla.`);
            return;
        }
        if (!confirm(`¿Estás seguro de que quieres eliminar la ronda "${roundName}"?\n\nEsta acción no se puede deshacer.`)) return;
        if (!confirm(`⚠️ CONFIRMACIÓN FINAL\n\n¿Eliminar permanentemente la ronda "${roundName}"?`)) return;
        try {
            const { error } = await supabaseClient.from('rounds').delete().eq('id', roundId);
            if (error) throw error;
            window.location.reload();
        } catch(e) {
            alert('Error eliminando ronda: ' + e.message);
        }
    };

    window.openEditRoundModal = (roundId) => {
        console.log("Intentando editar ronda ID:", roundId);
        // Usamos == para permitir comparación entre string y number si el ID es numérico en la DB
        const round = appData.rounds.find(r => r.id == roundId);
        
        if (!round) {
            console.error("Ronda no encontrada para ID:", roundId, "Rondas disponibles:", appData.rounds);
            return;
        }

        document.getElementById('editRoundId').value = round.id;
        document.getElementById('editRoundNameInput').value = round.name || "";
        document.getElementById('editRoundFormatInput').value = round.format || "";
        document.getElementById('editRoundDateInput').value = round.date || "";
        document.getElementById('editRoundTimeInput').value = round.time || "";
        document.getElementById('editRoundCourseInput').value = round.course || "";
        document.getElementById('editRoundStatusInput').value = round.status || "scheduled";

        document.getElementById('editRoundModal').classList.remove('hidden');
    };

    // ========================================================
    // 4. LÓGICA DE EJECUCIÓN PRINCIPAL
    // ========================================================
    try {
        console.log("SCRIPT.JS - DOMContentLoaded INICIADO");
        contentArea.innerHTML = '<div class="loading-spinner-container"><div class="loading-spinner"></div><p>Cargando datos iniciales...</p></div>';
        
        appData = await loadAppDataFromSupabase();
        console.log("appData final después de la carga:", appData);

        if (appData && Array.isArray(appData.rounds) && appData.teams) {
            await calculateAndSyncScores();
        } else {
            console.warn("appData no completamente inicializada o con estructura incorrecta, saltando cálculo de scores inicial.");
        }
        
        if (hamburgerMenu) {
            hamburgerMenu.addEventListener('click', () => {
                sidebar.classList.toggle('open');
                hamburgerMenu.querySelector('i').classList.toggle('fa-bars');
                hamburgerMenu.querySelector('i').classList.toggle('fa-times');
            });
        } else {
            console.warn("Elemento hamburgerMenu no encontrado.");
        }

        sidebarLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                sidebarLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                const targetPage = link.dataset.target;
                renderContent(targetPage);
                if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
                    sidebar.classList.remove('open');
                    const icon = hamburgerMenu.querySelector('i');
                    if (icon) {
                        icon.classList.add('fa-bars');
                        icon.classList.remove('fa-times');
                    }
                }
            });
        });

        const initialTarget = sidebarLinks[0]?.dataset.target || 'home';
        if (sidebarLinks[0]) sidebarLinks[0].classList.add('active');
        renderContent(initialTarget);

        // Admin Login Modal Logic
        const loginModal = document.getElementById('loginModal');
        const loginNavLi = document.getElementById('loginNavLi');
        const logoutNavLi = document.getElementById('logoutNavLi');
        
        if (isAdmin) {
            loginNavLi.style.display = 'none';
            logoutNavLi.style.display = 'block';
        } else {
            loginNavLi.style.display = 'block';
            logoutNavLi.style.display = 'none';
        }

        document.getElementById('openLoginModal')?.addEventListener('click', (e) => {
            e.preventDefault();
            loginModal.classList.remove('hidden');
        });
        document.getElementById('closeLoginModal')?.addEventListener('click', () => {
            loginModal.classList.add('hidden');
        });
        
        // Modal Crear Ronda Logic
        const createRoundModal = document.getElementById('createRoundModal');
        document.getElementById('closeCreateRoundModal')?.addEventListener('click', () => {
            createRoundModal.classList.add('hidden');
        });

        // Modal Editar Ronda Logic
        const editRoundModal = document.getElementById('editRoundModal');
        document.getElementById('closeEditRoundModal')?.addEventListener('click', () => {
            editRoundModal.classList.add('hidden');
        });

        document.getElementById('submitEditRoundBtn')?.addEventListener('click', async () => {
            const id = document.getElementById('editRoundId').value;
            const name = document.getElementById('editRoundNameInput').value.trim();
            const format = document.getElementById('editRoundFormatInput').value;
            const date = document.getElementById('editRoundDateInput').value;
            const time = document.getElementById('editRoundTimeInput').value || null;
            const course = document.getElementById('editRoundCourseInput').value.trim() || null;
            const status = document.getElementById('editRoundStatusInput').value || 'scheduled';
            const errorMsg = document.getElementById('editRoundErrorMsg');

            if (!name || !format || !date) {
                errorMsg.style.display = 'block';
                return;
            }
            errorMsg.style.display = 'none';
            const btn = document.getElementById('submitEditRoundBtn');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
            btn.disabled = true;

            try {
                const { error } = await supabaseClient.from('rounds').update({
                    name, format, date, time, course, status
                }).eq('id', id);
                
                if (error) throw error;
                window.location.reload();
            } catch (e) {
                alert('Error al actualizar la ronda: ' + e.message);
                btn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
                btn.disabled = false;
            }
        });

        document.getElementById('submitCreateRoundBtn')?.addEventListener('click', async () => {
            const name = document.getElementById('roundNameInput').value.trim();
            const format = document.getElementById('roundFormatInput').value;
            const date = document.getElementById('roundDateInput').value;
            const time = document.getElementById('roundTimeInput').value || null;
            const course = document.getElementById('roundCourseInput').value.trim() || appData.location || 'Campo de Golf';
            const status = document.getElementById('roundStatusInput').value || 'scheduled';
            const errorMsg = document.getElementById('roundErrorMsg');

            if (!name || !format || !date) {
                errorMsg.style.display = 'block';
                return;
            }
            errorMsg.style.display = 'none';
            const btn = document.getElementById('submitCreateRoundBtn');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';
            btn.disabled = true;

            try {
                const { error } = await supabaseClient.from('rounds').insert([{name, format, date, time, course, status}]);
                if (error) throw error;
                window.location.reload();
            } catch (e) {
                alert('Error creando ronda: ' + e.message);
                btn.innerHTML = '<i class="fas fa-plus-circle"></i> Crear Ronda';
                btn.disabled = false;
            }
        });

        document.getElementById('loginSubmitBtn')?.addEventListener('click', () => {
            const pwd = document.getElementById('adminPasswordInput').value;
            if (pwd === adminPassword) {
                localStorage.setItem('ryderAdmin', 'true');
                window.location.reload();
            } else {
                document.getElementById('loginErrorMsg').style.display = 'block';
            }
        });
        document.getElementById('doLogoutBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('ryderAdmin');
            window.location.reload();
        });

    } catch (error) {
        console.error("Error durante la inicialización o carga de datos principal:", error);
        contentArea.innerHTML = `<div class="error-message">Error crítico durante la inicialización: ${error.message}. Por favor, revisa la consola e intenta recargar la página.</div>`;
    }

    function calculatePlayerPerformancePoints(allMatches, teamsData) {
        const playerPoints = {}; 
        if (!teamsData || !allMatches) {
            console.warn("Datos de equipos o partidos no disponibles para calcular rendimiento de jugadores.");
            return playerPoints;
        }
        for (const teamKey in teamsData) {
            if (teamsData[teamKey] && Array.isArray(teamsData[teamKey].players)) {
                teamsData[teamKey].players.forEach(player => {
                    if(player && player.name) playerPoints[player.name] = 0;
                });
            }
        }
        allMatches.forEach(match => {
            const tortugasPlayers = Array.isArray(match.tortugas) ? match.tortugas : [];
            const salmonesPlayers = Array.isArray(match.salmones) ? match.salmones : [];
            if (match.winner === 'tortugas') {
                tortugasPlayers.forEach(playerName => { if (playerPoints[playerName] !== undefined) playerPoints[playerName] += 1; });
            } else if (match.winner === 'salmones') {
                salmonesPlayers.forEach(playerName => { if (playerPoints[playerName] !== undefined) playerPoints[playerName] += 1; });
            } else if (match.winner === 'empate') {
                tortugasPlayers.forEach(playerName => { if (playerPoints[playerName] !== undefined) playerPoints[playerName] += 0.5; });
                salmonesPlayers.forEach(playerName => { if (playerPoints[playerName] !== undefined) playerPoints[playerName] += 0.5; });
            }
        });
        return playerPoints;
    }
});