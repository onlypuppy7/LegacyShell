export const REASONS = {
    none: {
        title: 'Currently Unavailable',
        message: "We'll be back shortly.",
    },
    offline: {
        title: 'Offline for Now',
        message: "The game is currently offline.",
    },
    maintenance: {
        title: 'Under Maintenance',
        message: "We're performing scheduled maintenance. Check back soon!",
    },
    emergency: {
        title: 'Emergency Fix In Progress',
        message: "We've hit an issue and are working to get things back up as fast as we can.",
    },
    update: {
        title: 'Major Update In Progress',
        message: "We're rolling out a big update - this won't take long!",
    },
    migration: {
        title: 'Migrating Servers',
        message: "We're moving to new servers for a better experience. Thanks for your patience!",
    },
};

export const DEFAULT_REASON = 'maintenance';
