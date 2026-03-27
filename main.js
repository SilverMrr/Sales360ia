// Language translations
const translations = {
  fr: {
    // Navigation
    dashboard: "Tableau de bord",
    contacts: "Contacts",
    pipeline: "Pipeline",
    telephony: "Téléphonie",
    visio: "Visioconférence",
    settings: "Paramètres",
    recommendations: "Recommandations",

    // Home page
    heroTitle: "Gérez vos ventes comme jamais auparavant",
    heroSubtitle: "La solution tout-en-un pour votre équipe commerciale",
    getStarted: "Commencer",
    learnMore: "En savoir plus",

    feature1Title: "Tableau de bord",
    feature1Desc: "Suivez vos performances et statistiques en temps réel",
    feature2Title: "Téléphonie",
    feature2Desc: "Appelez directement depuis l'application",
    feature3Title: "Visioconférence",
    feature3Desc: "Organisez des réunions vidéo avec vos clients",
    feature5Title: "Recommandations",
    feature5Desc: "Actions intelligentes pour optimiser vos ventes",
    feature6Title: "Contacts",
    feature6Desc: "Gérez tous vos contacts et prospects en un seul endroit",
    feature7Title: "Pipeline",
    feature7Desc: "Visualisez et gérez vos opportunités commerciales",

    // Dashboard
    dashboardTitle: "Tableau de bord",
    totalRevenue: "Revenu total",
    newLeads: "Nouveaux prospects",
    conversionRate: "Taux de conversion",
    activeCalls: "Appels actifs",
    recentActivity: "Activité récente",
    topPerformers: "Meilleurs performers",
    recommendationsTitle: "Recommandations",
    urgentActions: "Actions urgentes",
    followUps: "Relances à faire",
    opportunities: "Opportunités",
    all: "Toutes",
    urgent: "Urgentes",
    followUp: "Relances",
    atRisk: "À risque",
    opportunity: "Opportunité",
    smartRecommendations: "Recommandations intelligentes",
    viewAll: "Voir tout",
    recoQuick1: "Jean Dupont à relancer aujourd'hui",
    recoQuick1Desc: "Dernier contact il y a 14 jours • €45,000",
    recoQuick2: "Deal DEF Corp stagnant depuis 15 jours",
    recoQuick2Desc: "Action immédiate requise • €85,000",
    recoQuick3: "Opportunité cross-sell avec ABC Industries",
    recoQuick3Desc: "Client actif, profil premium • €32,000",
  },
  en: {
    // Navigation
    dashboard: "Dashboard",
    contacts: "Contacts",
    pipeline: "Pipeline",
    telephony: "Telephony",
    visio: "Video Conference",
    settings: "Settings",
    recommendations: "Recommendations",

    // Home page
    heroTitle: "Manage your sales like never before",
    heroSubtitle: "The all-in-one solution for your sales team",
    getStarted: "Get Started",
    learnMore: "Learn More",

    feature1Title: "Dashboard",
    feature1Desc: "Track your performance and statistics in real-time",
    feature2Title: "Telephony",
    feature2Desc: "Call directly from the application",
    feature3Title: "Video Conference",
    feature3Desc: "Organize video meetings with your clients",
    feature5Title: "Recommendations",
    feature5Desc: "Smart actions to optimize your sales",
    feature6Title: "Contacts",
    feature6Desc: "Manage all your contacts and prospects in one place",
    feature7Title: "Pipeline",
    feature7Desc: "Visualize and manage your sales opportunities",

    // Dashboard
    dashboardTitle: "Dashboard",
    totalRevenue: "Total Revenue",
    newLeads: "New Leads",
    conversionRate: "Conversion Rate",
    activeCalls: "Active Calls",
    recentActivity: "Recent Activity",
    topPerformers: "Top Performers",
    recommendationsTitle: "Recommendations",
    urgentActions: "Urgent Actions",
    followUps: "Follow-ups",
    opportunities: "Opportunities",
    all: "All",
    urgent: "Urgent",
    followUp: "Follow-ups",
    atRisk: "At Risk",
    opportunity: "Opportunity",
    smartRecommendations: "Smart Recommendations",
    viewAll: "View All",
    recoQuick1: "Jean Dupont to follow up today",
    recoQuick1Desc: "Last contact 14 days ago • €45,000",
    recoQuick2: "DEF Corp deal stagnant for 15 days",
    recoQuick2Desc: "Immediate action required • €85,000",
    recoQuick3: "Cross-sell opportunity with ABC Industries",
    recoQuick3Desc: "Active client, premium profile • €32,000",
  },
}

// Current language
let currentLang = "fr"

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  // Set active navigation
  setActiveNav()

  // Setup language switcher
  setupLanguageSwitcher()

  // Initialize language
  updateLanguage()

  // Mark current page lang button as active
  const savedLang = localStorage.getItem("sales360-lang") || "fr"
  currentLang = savedLang
  updateLangButtons()
  updateLanguage()

  // Add event listeners to all "Voir" buttons
  setTimeout(() => {
    const viewButtons = document.querySelectorAll(".view-contact-btn")
    viewButtons.forEach((btn) => {
      btn.addEventListener("click", function () {
        const contactName = this.dataset.contact
        showContactRecommendations(contactName)
      })
    })
  }, 100)
})

// Set active navigation item
function setActiveNav() {
  const currentPage = window.location.pathname.split("/").pop() || "index.html"
  const navLinks = document.querySelectorAll(".nav-link")

  navLinks.forEach((link) => {
    const href = link.getAttribute("href")
    if (href === currentPage || (currentPage === "" && href === "index.html")) {
      link.classList.add("active")
    }
  })
}

// Setup language switcher
function setupLanguageSwitcher() {
  const langButtons = document.querySelectorAll(".lang-btn")

  langButtons.forEach((btn) => {
    btn.addEventListener("click", function () {
      const lang = this.dataset.lang
      currentLang = lang
      localStorage.setItem("sales360-lang", lang)
      updateLangButtons()
      updateLanguage()
    })
  })
}

// Update language button states
function updateLangButtons() {
  const langButtons = document.querySelectorAll(".lang-btn")
  langButtons.forEach((btn) => {
    if (btn.dataset.lang === currentLang) {
      btn.classList.add("active")
    } else {
      btn.classList.remove("active")
    }
  })
}

// Update all translatable elements
function updateLanguage() {
  const elements = document.querySelectorAll("[data-i18n]")

  elements.forEach((el) => {
    const key = el.dataset.i18n
    if (translations[currentLang] && translations[currentLang][key]) {
      el.textContent = translations[currentLang][key]
    }
  })
}

// Mock call functionality
function makeCall() {
  alert(currentLang === "fr" ? "Appel en cours..." : "Calling...")
}

function answerCall() {
  alert(currentLang === "fr" ? "Appel accepté" : "Call answered")
}

function declineCall() {
  alert(currentLang === "fr" ? "Appel refusé" : "Call declined")
}

// Mock form submission
function handleLogin(e) {
  e.preventDefault()
  alert(currentLang === "fr" ? "Connexion réussie !" : "Login successful!")
  window.location.href = "dashboard.html"
}

// Contact recommendations data
const contactRecommendations = {
  "Sophie Martin": [
    {
      type: "opportunity",
      icon: "🎯",
      title: {
        fr: "Opportunité de upsell détectée",
        en: "Upsell opportunity detected",
      },
      description: {
        fr: "Cliente satisfaite depuis 8 mois. Profil compatible avec notre pack premium.",
        en: "Satisfied client for 8 months. Profile compatible with our premium pack.",
      },
      time: {
        fr: "Cette semaine",
        en: "This week",
      },
      value: "€15,000",
      actions: [
        { label: { fr: "Préparer offre", en: "Prepare offer" }, class: "btn-primary" },
        { label: { fr: "Voir historique", en: "View history" }, class: "btn-outline" },
      ],
    },
    {
      type: "follow-up",
      icon: "📅",
      title: {
        fr: "Réunion de suivi planifiée",
        en: "Follow-up meeting scheduled",
      },
      description: {
        fr: "Rendez-vous trimestriel prévu dans 5 jours pour évaluer la satisfaction.",
        en: "Quarterly appointment in 5 days to evaluate satisfaction.",
      },
      time: {
        fr: "Dans 5 jours",
        en: "In 5 days",
      },
      value: "€32,000",
      actions: [
        { label: { fr: "Préparer meeting", en: "Prepare meeting" }, class: "btn-primary" },
        { label: { fr: "Notes précédentes", en: "Previous notes" }, class: "btn-outline" },
      ],
    },
  ],
  "Pierre Dupont": [
    {
      type: "urgent",
      icon: "⚡",
      title: {
        fr: "Relance urgente nécessaire",
        en: "Urgent follow-up needed",
      },
      description: {
        fr: "Prospect chaud sans contact depuis 10 jours. Risque de perdre l'opportunité.",
        en: "Hot prospect with no contact for 10 days. Risk of losing the opportunity.",
      },
      time: {
        fr: "Aujourd'hui",
        en: "Today",
      },
      value: "€67,500",
      actions: [
        { label: { fr: "Appeler maintenant", en: "Call now" }, class: "btn-primary" },
        { label: { fr: "Envoyer email", en: "Send email" }, class: "btn-outline" },
      ],
    },
    {
      type: "follow-up",
      icon: "📧",
      title: {
        fr: "Proposition à envoyer",
        en: "Proposal to send",
      },
      description: {
        fr: "Suite à la réunion de qualification, le prospect attend notre proposition détaillée.",
        en: "Following the qualification meeting, the prospect is waiting for our detailed proposal.",
      },
      time: {
        fr: "Demain",
        en: "Tomorrow",
      },
      value: "€67,500",
      actions: [
        { label: { fr: "Générer proposition", en: "Generate proposal" }, class: "btn-primary" },
        { label: { fr: "Templates", en: "Templates" }, class: "btn-outline" },
      ],
    },
  ],
  "Marie Leroy": [
    {
      type: "opportunity",
      icon: "💡",
      title: {
        fr: "Cross-sell recommandé",
        en: "Cross-sell recommended",
      },
      description: {
        fr: "Utilise activement notre service principal. Pourrait être intéressée par nos modules complémentaires.",
        en: "Actively uses our main service. Could be interested in our complementary modules.",
      },
      time: {
        fr: "Cette semaine",
        en: "This week",
      },
      value: "€18,500",
      actions: [
        { label: { fr: "Pitcher modules", en: "Pitch modules" }, class: "btn-primary" },
        { label: { fr: "Voir usage", en: "View usage" }, class: "btn-outline" },
      ],
    },
  ],
  "Jean Leblanc": [
    {
      type: "follow-up",
      icon: "🔄",
      title: {
        fr: "Renouvellement à anticiper",
        en: "Renewal to anticipate",
      },
      description: {
        fr: "Le contrat arrive à échéance dans 30 jours. Moment idéal pour discuter du renouvellement.",
        en: "Contract expires in 30 days. Ideal time to discuss renewal.",
      },
      time: {
        fr: "Dans 2 semaines",
        en: "In 2 weeks",
      },
      value: "€45,000",
      actions: [
        { label: { fr: "Planifier appel", en: "Schedule call" }, class: "btn-primary" },
        { label: { fr: "Préparer offre", en: "Prepare offer" }, class: "btn-outline" },
      ],
    },
  ],
  "Claire Dubois": [
    {
      type: "urgent",
      icon: "📞",
      title: {
        fr: "Relance immédiate recommandée",
        en: "Immediate follow-up recommended",
      },
      description: {
        fr: "Prospect qualifié sans contact depuis 12 jours. Forte probabilité de conversion.",
        en: "Qualified prospect with no contact for 12 days. High probability of conversion.",
      },
      time: {
        fr: "Aujourd'hui",
        en: "Today",
      },
      value: "€28,000",
      actions: [
        { label: { fr: "Appeler", en: "Call" }, class: "btn-primary" },
        { label: { fr: "Voir notes", en: "View notes" }, class: "btn-outline" },
      ],
    },
  ],
  "Marc Bernard": [
    {
      type: "opportunity",
      icon: "🎯",
      title: {
        fr: "Expansion de compte possible",
        en: "Account expansion possible",
      },
      description: {
        fr: "Client satisfait avec 3 licences. Son équipe a grandi, opportunité d'expansion.",
        en: "Satisfied client with 3 licenses. Team has grown, expansion opportunity.",
      },
      time: {
        fr: "Cette semaine",
        en: "This week",
      },
      value: "€22,000",
      actions: [
        { label: { fr: "Proposer expansion", en: "Propose expansion" }, class: "btn-primary" },
        { label: { fr: "Analyser usage", en: "Analyze usage" }, class: "btn-outline" },
      ],
    },
  ],
}

// Show contact recommendations modal
function showContactRecommendations(contactName) {
  const modal = document.getElementById("contactModal")
  const modalTitle = document.getElementById("modalContactName")
  const recommendationsContainer = document.getElementById("contactRecommendations")

  if (!modal || !modalTitle || !recommendationsContainer) return

  // Set contact name in modal title
  modalTitle.innerHTML = `<span style="color: var(--accent-orange);">${contactName}</span> - ${currentLang === "fr" ? "Actions recommandées" : "Recommended actions"}`

  // Get recommendations for this contact
  const recommendations = contactRecommendations[contactName] || []

  if (recommendations.length === 0) {
    recommendationsContainer.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-gray);">
        <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
        <p style="font-weight: 600; font-size: 18px; margin-bottom: 8px;">${currentLang === "fr" ? "Aucune recommandation" : "No recommendations"}</p>
        <p>${currentLang === "fr" ? "Aucune action recommandée pour ce contact pour le moment." : "No recommended actions for this contact at the moment."}</p>
      </div>
    `
  } else {
    // Build recommendations HTML
    let html = ""
    recommendations.forEach((reco) => {
      const typeClass = `reco-${reco.type}`
      const badgeClass = `reco-badge-${reco.type}`
      const badgeText =
        currentLang === "fr"
          ? reco.type === "urgent"
            ? "Urgent"
            : reco.type === "follow-up"
              ? "Relance"
              : reco.type === "opportunity"
                ? "Opportunité"
                : "À risque"
          : reco.type === "urgent"
            ? "Urgent"
            : reco.type === "follow-up"
              ? "Follow-up"
              : reco.type === "opportunity"
                ? "Opportunity"
                : "At Risk"

      html += `
        <div class="reco-card ${typeClass}" style="margin-bottom: 0;">
          <div class="reco-icon">${reco.icon}</div>
          <div class="reco-content">
            <div class="reco-header">
              <h3 class="reco-title">${reco.title[currentLang]}</h3>
              <span class="reco-badge ${badgeClass}">${badgeText}</span>
            </div>
            <p class="reco-description">${reco.description[currentLang]}</p>
            <div class="reco-meta">
              <span class="reco-time">⏰ ${reco.time[currentLang]}</span>
              <span class="reco-value">💰 ${reco.value}</span>
            </div>
            <div class="reco-actions">
              ${reco.actions
                .map((action) => `<button class="btn ${action.class}">${action.label[currentLang]}</button>`)
                .join("")}
            </div>
          </div>
        </div>
      `
    })

    recommendationsContainer.innerHTML = html
  }

  // Show modal
  modal.style.display = "block"
}

// Close modal when clicking outside
window.onclick = (event) => {
  const modal = document.getElementById("contactModal")
  if (event.target === modal) {
    modal.style.display = "none"
  }
}

// Export functions for HTML onclick
window.makeCall = makeCall
window.answerCall = answerCall
window.declineCall = declineCall
window.handleLogin = handleLogin
window.showContactRecommendations = showContactRecommendations
