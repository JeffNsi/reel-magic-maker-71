import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useFilmAccount() {
  const [userId, setUserId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active) {
          setUserId(data.user?.id ?? null);
          setChecked(true);
        }
      })
      .catch(() => {
        if (active) setChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return { userId, checked };
}
