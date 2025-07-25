import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

export function setupAuth(app: Express) {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  app.set("trust proxy", 1);
  app.use(session({
    secret: process.env.SESSION_SECRET || 'your-session-secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: sessionTtl,
    },
  }));
  
  app.use(passport.initialize());
  app.use(passport.session());

  const hasCredentials = process.env.RFP_GOOGLE_CLIENT_ID && process.env.RFP_GOOGLE_CLIENT_SECRET;

  if (hasCredentials) {
    // Get the base URL for OAuth callback
    const getCallbackURL = () => {
      // For development, prefer localhost if available
      // This allows using a separate dev OAuth app with localhost callback
      if (process.env.NODE_ENV === 'development') {
        // Check if we're running on localhost (local development)
        const isLocalhost = process.env.REPLIT_DOMAINS && process.env.REPLIT_DOMAINS.includes('localhost');
        if (isLocalhost || process.env.USE_LOCALHOST_OAUTH === 'true') {
          console.log('Using localhost callback for development OAuth app');
          return "http://localhost:5000/api/auth/google/callback";
        }
      }
      
      // Default to relative URL for production and Replit preview
      console.log('Using relative callback URL');
      return "/api/auth/google/callback";
    };

    passport.use(new GoogleStrategy({
      clientID: process.env.RFP_GOOGLE_CLIENT_ID!,
      clientSecret: process.env.RFP_GOOGLE_CLIENT_SECRET!,
      callbackURL: getCallbackURL(),
      proxy: true // This tells Passport to trust the proxy headers
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if user exists
        let user = await storage.getUserByGoogleId(profile.id);
        
        if (!user) {
          // Create new user
          user = await storage.createUser({
            email: profile.emails?.[0]?.value || '',
            name: profile.displayName || '',
            googleId: profile.id,
          });
        }
        
        return done(null, user);
      } catch (error) {
        return done(error, false);
      }
    }));

    passport.serializeUser((user: any, done) => {
      done(null, user.id);
    });

    passport.deserializeUser(async (id: string, done) => {
      try {
        const user = await storage.getUser(id);
        done(null, user);
      } catch (error) {
        done(error, false);
      }
    });
  } else {
    console.warn('Google OAuth credentials not provided - authentication disabled');
  }

  // Auth routes - always available
  app.get("/api/auth/google", (req, res, next) => {
    if (!hasCredentials) {
      return res.status(503).json({ 
        error: "Google OAuth not configured", 
        message: "Please configure RFP_GOOGLE_CLIENT_ID and RFP_GOOGLE_CLIENT_SECRET" 
      });
    }
    
    // Log the actual domain being used for debugging
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('host');
    const fullCallbackURL = `${protocol}://${host}/api/auth/google/callback`;
    
    console.log(`OAuth request from: ${protocol}://${host}`);
    console.log(`Expected callback URL: ${fullCallbackURL}`);
    console.log('Headers:', {
      host: req.get('host'),
      'x-forwarded-host': req.get('x-forwarded-host'),
      'x-forwarded-proto': req.get('x-forwarded-proto'),
      origin: req.get('origin')
    });
    
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
  });

  app.get("/api/auth/google/callback", (req, res, next) => {
    console.log('OAuth callback received:', {
      url: req.url,
      query: req.query,
      headers: {
        host: req.get('host'),
        'user-agent': req.get('user-agent'),
        referer: req.get('referer')
      }
    });
    
    if (!hasCredentials) {
      console.error('OAuth callback called but credentials not configured');
      return res.redirect("/?error=oauth_not_configured");
    }
    
    passport.authenticate("google", (err: any, user: any, info: any) => {
      if (err) {
        console.error('Google auth error:', err);
        return res.redirect(`/?error=auth_error&message=${encodeURIComponent(err.message)}`);
      }
      if (!user) {
        console.error('Google auth failed - no user:', info);
        return res.redirect(`/?error=auth_failed&message=${encodeURIComponent(info?.message || 'Authentication failed')}`);
      }
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error('Login error:', loginErr);
          return res.redirect(`/?error=login_error&message=${encodeURIComponent(loginErr.message)}`);
        }
        console.log('User successfully authenticated:', user.email);
        return res.redirect("/");
      });
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
      }
      res.redirect("/");
    });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};