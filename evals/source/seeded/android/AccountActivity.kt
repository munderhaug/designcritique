package app.sample.account

import androidx.activity.ComponentActivity
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable

class AccountActivity : ComponentActivity() {
    override fun onBackPressed() {
        moveTaskToBack(true)
    }
}

@Composable
fun AccountScreen() {
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = { ModalDrawerSheet { Text("Home") ; Text("Account") ; Text("Help") } },
    ) {
        Icon(Icons.Filled.Menu, contentDescription = "Menu")
        Text("Account")
    }
}
